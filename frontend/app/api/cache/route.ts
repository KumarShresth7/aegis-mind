import { NextResponse } from "next/server";
import { fetchCacheData, clearCacheData } from "@/lib/cache-api";

export async function GET() {
  const data = await fetchCacheData();
  return NextResponse.json(data);
}

export async function DELETE() {
  const removed = await clearCacheData();
  return NextResponse.json({ removed });
}
