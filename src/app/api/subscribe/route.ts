import { Resend } from "resend";
import { NextResponse } from "next/server";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string };
  const email = body.email?.trim() ?? "";

  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json(
      { success: false, error: "有効なメールアドレスを入力してください" },
      { status: 400 },
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  // 登録者は配信対象セグメントに紐づける。未設定だとブロードキャストの
  // 宛先に入らないため、設定漏れは 500 で表面化させる。
  const segmentId = process.env.RESEND_SEGMENT_ID;

  if (!apiKey || !segmentId) {
    return NextResponse.json(
      { success: false, error: "サーバー設定エラー" },
      { status: 500 },
    );
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.contacts.create({
    email,
    segments: [{ id: segmentId }],
  });

  if (error) {
    return NextResponse.json(
      { success: false, error: "登録に失敗しました" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
