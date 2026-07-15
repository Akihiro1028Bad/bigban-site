# 承認画面セキュリティ運用

承認画面は、長期合言葉を通常APIへ送らないCookie session方式です。ログイン成功後は30分の署名付きHttpOnly Cookieを使います。公開・予約公開は`publish`、メディア一覧・アップロードは`media` scopeで再認証し、scope別Cookieは5分で失効します。

本番では`APPROVE_AUTH_ENABLED=true`、`APPROVE_SECRET`、別値の`APPROVE_SESSION_SECRET`、`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`をVercelに設定します。Upstash未設定・通信失敗時の認証交換は503でfail-closedです。自宅PCやLINEへ`APPROVE_SECRET`を置かないでください。

## secretローテーション

1. Upstashとsession環境変数を登録してデプロイする。
2. 新しい`APPROVE_SECRET`と`APPROVE_SESSION_SECRET`を別々に生成する。
3. Vercelの値を更新して再デプロイする。
4. 自宅PCに旧`APPROVE_SECRET`があれば削除する。
5. 旧合言葉、旧Bearer、旧`?token=`が拒否されることを確認する。

値そのものをログ、チケット、LINEへ残してはいけません。共有が必要な場合は管理者が安全な経路を使います。

## インシデント確認

外部APIエラーは`operation`、HTTP status、request IDだけを通知へ載せます。microCMSやLINEのレスポンス本文をログ・LINEへ転送しません。診断ログも既知secret、API key、Bearer、query token、HTMLをredactし、detailを1,024文字に制限します。
