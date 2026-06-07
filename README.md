# times-creator

Discord の Forum `times` に `times-xxxx` Post を作る最小 Bot です。

一般ユーザーには Forum の Post 作成権限を付けず、Bot の slash command だけで
Post を作成します。Post 作成後、ユーザーは作成された Post/thread 内で通常通り投稿します。

## 必要なもの

- Deno
- Discord Bot token
- Bot を追加した Discord サーバー
- times Forum channel ID

Bot の招待 URL には `bot` と `applications.commands` の scope を含めてください。
`Message Content Intent` は不要です。

Bot には最低限以下の権限を付けてください。

- View Channels
- Send Messages
- Read Message History

Discord の Forum 権限 UI では `Send Messages` が `Create Posts` と表示される場合があります。

## Bot をサーバーに招待する

1. Discord Developer Portal を開く。
2. 対象 Application を選ぶ。
3. `OAuth2` -> `URL Generator` を開く。
4. `Scopes` で `bot` と `applications.commands` を選ぶ。
5. `Bot Permissions` で `View Channels`, `Send Messages`, `Read Message History`
   を選ぶ。
6. 生成された URL をブラウザで開く。
7. 対象サーバーを選んで認可する。

招待するユーザーには、対象サーバーで Bot を追加できる権限が必要です。通常は
`Manage Server` 権限が必要です。

## 設定

```sh
cd src
cp .env.example .env
```

`.env` を編集します。

```env
DISCORD_TOKEN=...
GUILD_ID=...
TIMES_FORUM_CHANNEL_ID=...
COMMAND_CHANNEL_ID=...
```

`COMMAND_CHANNEL_ID` は任意です。設定した場合、そのチャンネルで実行された
`/create-times` だけを受け付けます。

## 起動

```sh
deno task start
```

ログは以下のファイルに JSON Lines 形式で追記されます。

```text
$XDG_STATE_HOME/times-creator.log
```

`XDG_STATE_HOME` が未設定の場合は以下に出力されます。

```text
~/.local/state/times-creator.log
```

## 使い方

Bot を起動すると、対象サーバーに `/create-times` コマンドを登録します。

Discord で以下の slash command を実行します。

```text
/create-times name: times-kjuq
```

作成できる名前は `times-` で始まる英小文字・数字・ハイフンのみです。

同名の active Post または archived Post が存在する場合は、新規作成せず既存 Post を返します。
