import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ ok: true, servicio: "vacaciones-e3" });
}
