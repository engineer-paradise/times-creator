import { createBot } from 'npm:@discordeno/bot@21.0.0';
import {
	ApplicationCommandOptionTypes,
	ApplicationCommandTypes,
	ChannelTypes,
	GatewayIntents,
	InteractionTypes,
} from 'npm:@discordeno/types@21.0.0';

const POST_NAME_PATTERN = /^times-[a-z0-9][a-z0-9-]{1,30}$/;
const COMMAND_NAME = 'create-times';
const LOG_FILE_NAME = 'times-creator.log';

type Config = {
	token: string;
	guildId: string;
	timesForumChannelId: string;
	commandChannelId?: string;
};

function getRequiredEnv(name: string): string {
	const value = Deno.env.get(name)?.trim();
	if (!value) {
		throw new Error(`${name} is required`);
	}
	return value;
}

function loadConfig(): Config {
	return {
		token: getRequiredEnv('DISCORD_TOKEN'),
		guildId: getRequiredEnv('GUILD_ID'),
		timesForumChannelId: getRequiredEnv('TIMES_FORUM_CHANNEL_ID'),
		commandChannelId: Deno.env.get('COMMAND_CHANNEL_ID')?.trim() || undefined,
	};
}

function isValidPostName(name: string): boolean {
	return POST_NAME_PATTERN.test(name);
}

function getLogPath(): string {
	const stateHome = Deno.env.get('XDG_STATE_HOME')?.trim() || `${getRequiredEnv('HOME')}/.local/state`;
	return `${stateHome}/${LOG_FILE_NAME}`;
}

function getParentDirectory(path: string): string {
	const lastSlashIndex = path.lastIndexOf('/');
	if (lastSlashIndex <= 0) {
		throw new Error(`Cannot detect parent directory: ${path}`);
	}
	return path.slice(0, lastSlashIndex);
}

async function log(level: 'info' | 'warn' | 'error', event: string, data = {}) {
	const line = JSON.stringify({
		level,
		event,
		...data,
		at: new Date().toISOString(),
	});
	const logPath = getLogPath();

	await Deno.mkdir(getParentDirectory(logPath), { recursive: true });
	await Deno.writeTextFile(logPath, `${line}\n`, { append: true });
}

function serializeError(error: unknown) {
	if (!(error instanceof Error)) {
		return { message: String(error) };
	}

	return {
		name: error.name,
		message: error.message,
		cause: error.cause,
		stack: error.stack,
	};
}

function getDiscordErrorCause(error: unknown): { status?: number; body?: string } | undefined {
	if (!(error instanceof Error)) return undefined;
	if (!error.cause || typeof error.cause !== 'object') return undefined;

	const cause = error.cause as { status?: unknown; body?: unknown };
	return {
		status: typeof cause.status === 'number' ? cause.status : undefined,
		body: typeof cause.body === 'string' ? cause.body : undefined,
	};
}

async function main() {
	const config = loadConfig();

	const bot = createBot({
		token: config.token,
		intents: GatewayIntents.Guilds,
		desiredProperties: {
			user: {
				id: true,
			},
			interaction: {
				id: true,
				token: true,
				type: true,
				data: true,
				channelId: true,
				guildId: true,
				user: true,
			},
		},
		events: {
			async ready({ shardId, user }) {
				try {
					await bot.helpers.upsertGuildApplicationCommands(config.guildId, [{
						name: COMMAND_NAME,
						description: 'times Forum Post を作成します',
						type: ApplicationCommandTypes.ChatInput,
						options: [{
							name: 'name',
							description: '作成する Post 名。例: times-kjuq',
							type: ApplicationCommandOptionTypes.String,
							required: true,
						}],
					}]);
				} catch (error) {
					await log('error', 'command_registration_failed', {
						guildId: config.guildId,
						commandName: COMMAND_NAME,
						hint: 'Check GUILD_ID and invite the bot with both bot and applications.commands scopes.',
						error: serializeError(error),
					});
					throw error;
				}

				await log('info', 'ready', {
					shardId,
					userId: user.id.toString(),
					commandName: COMMAND_NAME,
				});
			},

			async interactionCreate(interaction) {
				if (interaction.type !== InteractionTypes.ApplicationCommand) return;
				if (interaction.data?.name !== COMMAND_NAME) return;
				if (interaction.guildId?.toString() !== config.guildId) return;
				if (
					config.commandChannelId &&
					interaction.channelId?.toString() !== config.commandChannelId
				) {
					await interaction.respond(
						'このコマンドは指定されたチャンネルでだけ実行できます。',
						{ isPrivate: true },
					);
					return;
				}

				const postName = interaction.data.options?.find((option) => option.name === 'name')?.value;

				if (!postName) return;
				if (typeof postName !== 'string') return;

				if (!isValidPostName(postName)) {
					await interaction.respond(
						'作成できませんでした: Post 名は `times-` で始まる英小文字・数字・ハイフンにしてください',
						{ isPrivate: true },
					);
					return;
				}

				try {
					const activeThreads = await bot.rest.getActiveThreads(config.guildId);
					const activeExisting = activeThreads.threads.find((thread) =>
						thread.name === postName &&
						thread.parentId?.toString() === config.timesForumChannelId
					);

					if (activeExisting) {
						await interaction.respond(`すでに存在します: <#${activeExisting.id}>`);
						return;
					}

					const archivedThreads = await bot.rest.getPublicArchivedThreads(config.timesForumChannelId, {
						limit: 100,
					});
					const archivedExisting = archivedThreads.threads.find((thread) => thread.name === postName);

					if (archivedExisting) {
						await interaction.respond(`すでに存在します: <#${archivedExisting.id}>`);
						return;
					}

					const requesterId = interaction.user.id;
					const created = await bot.rest.createForumThread(config.timesForumChannelId, {
						name: postName,
						autoArchiveDuration: 10080,
						message: {
							content: `created by <@${requesterId}>`,
							allowedMentions: {
								users: [requesterId],
							},
						},
					}, `times forum post requested by ${requesterId}`);

					await log('info', 'times_forum_post_created', {
						guildId: config.guildId,
						forumChannelId: config.timesForumChannelId,
						threadId: created.id.toString(),
						postName,
						requesterId: requesterId.toString(),
						interactionId: interaction.id.toString(),
					});

					await interaction.respond(`作成しました: <#${created.id}>`);
				} catch (error) {
					const discordError = getDiscordErrorCause(error);
					await log('error', 'times_forum_post_create_failed', {
						guildId: config.guildId,
						forumChannelId: config.timesForumChannelId,
						postName,
						requesterId: interaction.user.id.toString(),
						error: serializeError(error),
					});

					if (discordError?.status === 403) {
						await interaction.respond(
							'作成できませんでした: Bot が times Forum にアクセスできないか、Post 作成権限が不足しています。',
							{ isPrivate: true },
						);
						return;
					}

					await interaction.respond(
						'内部エラーにより作成できませんでした。Forum の tag 必須設定と Bot 権限を確認してください。',
						{ isPrivate: true },
					);
				}
			},
		},
	});

	await bot.start();
}

if (import.meta.main) {
	await main();
}
