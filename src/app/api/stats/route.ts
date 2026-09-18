import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = getSupabaseAdmin();
    const today = new Date().toISOString().slice(0, 10);

    const [{ count: subjects }, { count: kps }, { count: questions }, { data: papers }, { data: wrong }] =
      await Promise.all([
        sb.from("subjects").select("*", { count: "exact", head: true }),
        sb.from("knowledge_points").select("*", { count: "exact", head: true }),
        sb.from("questions").select("*", { count: "exact", head: true }),
        sb.from("papers").select("id,title,created_at").order("created_at", { ascending: false }).limit(5),
        sb
          .from("wrong_answers")
          .select("id")
          .eq("mastered", false),
      ]);

    const dueCount = ((wrong as unknown as Array<{ next_review_at: string | null }> | undefined) || [])
      .filter((w) => {
        if (!w.next_review_at) return true;
        return new Date(w.next_review_at) <= new Date();
      }).length;

    return NextResponse.json({
      subjects: subjects || 0,
      knowledgePoints: kps || 0,
      questions: questions || 0,
      recentPapers: papers || [],
      wrongPending: (wrong || []).length,
      dueForReview: dueCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "加载失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
