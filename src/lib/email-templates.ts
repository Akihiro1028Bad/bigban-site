import { escapeHtml } from "./email-utils";

interface AutoReplyParams {
  name: string;
  categoryLabel: string;
  message: string;
}

export function buildAutoReplyHtml(params: AutoReplyParams): string {
  const name = escapeHtml(params.name);
  const categoryLabel = escapeHtml(params.categoryLabel);
  const message = escapeHtml(params.message).replace(/\n/g, "<br>");

  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#0A0A0A;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0A0A;">
<tr><td align="center" style="padding:40px 20px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- Greeting -->
  <tr><td style="padding:0 40px;color:#F5F2EE;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.8;">
    <p style="margin:0 0 24px;">${name} 様</p>
    <p style="margin:0 0 24px;">
      この度はお問い合わせいただき、誠にありがとうございます。<br>
      以下の内容で承りました。担当者より折り返しご連絡いたしますので、今しばらくお待ちください。
    </p>
  </td></tr>

  <!-- Inquiry Summary -->
  <tr><td style="padding:0 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1A1A1A;border-left:3px solid #C8FF00;">
      <tr><td style="padding:24px;color:#F5F2EE;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.8;">
        <p style="margin:0 0 8px;color:#8A8A8A;font-size:12px;">カテゴリ</p>
        <p style="margin:0 0 20px;">${categoryLabel}</p>
        <p style="margin:0 0 8px;color:#8A8A8A;font-size:12px;">お問い合わせ内容</p>
        <p style="margin:0;">${message}</p>
      </td></tr>
    </table>
  </td></tr>

  <!-- Note -->
  <tr><td style="padding:24px 40px 0;color:#8A8A8A;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.8;">
    <p style="margin:0;">※ このメールは自動送信されています。このメールへの返信はできません。</p>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding:32px 40px;">
    <hr style="border:none;border-top:1px solid #333;">
  </td></tr>

  <!-- Facility Info -->
  <tr><td align="center" style="padding:0 40px 40px;color:#8A8A8A;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.8;">
    <p style="margin:0 0 4px;color:#F5F2EE;font-size:13px;letter-spacing:0.1em;">THE PICKLE BANG THEORY</p>
    <p style="margin:0 0 4px;">千葉県市川市八幡2-16-6 八幡ハタビル 6階</p>
    <p style="margin:0 0 4px;">営業時間: 6:00 - 23:00</p>
    <p style="margin:0;">Instagram: <a href="https://www.instagram.com/thepicklebangtheory/" style="color:#C8FF00;text-decoration:none;">@thepicklebangtheory</a></p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

export function buildAutoReplyText(params: AutoReplyParams): string {
  return `${params.name} 様

この度はお問い合わせいただき、誠にありがとうございます。
以下の内容で承りました。担当者より折り返しご連絡いたしますので、今しばらくお待ちください。

---
カテゴリ: ${params.categoryLabel}

お問い合わせ内容:
${params.message}
---

※ このメールは自動送信されています。このメールへの返信はできません。

THE PICKLE BANG THEORY
千葉県市川市八幡2-16-6 八幡ハタビル 6階
営業時間: 6:00 - 23:00
Instagram: @thepicklebangtheory`;
}
