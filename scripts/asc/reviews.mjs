// App Store のカスタマーレビュー(評価と本文)を読む。返信も書ける。
//   node scripts/asc/reviews.mjs                 # 新しい順に20件(前回から増えたものに「新」)
//   node scripts/asc/reviews.mjs --json          # 日次ルーティン用。newReviews が前回から増えた分
//   node scripts/asc/reviews.mjs reply <レビューID> --text "返信" [--apply]   # 返信(北村さんの確認を取ってから)
// 前回までに見たレビューの ID は ~/Library/Caches/kurabell-asc/reviews-seen.json に残す。
// 星だけの評価(本文なし)は API に出てこない。件数は App Store のページで見る。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { api, APP_ID, STATE_DIR, APPLY, has, opt, positional, checkLocks, dryNote } from "./client.mjs";

const SEEN_FILE = `${STATE_DIR}/reviews-seen.json`;
const [cmd, reviewId] = positional();

if (cmd === "reply") {
  const text = opt("--text");
  if (!reviewId || !text) { console.error('使い方: reply <レビューID> --text "返信"'); process.exit(1); }
  const r = (await api(`/v1/customerReviews/${reviewId}?include=response`));
  console.log(`★${r.data.attributes.rating} ${r.data.attributes.title}\n${r.data.attributes.body}\n\n→ 返信${r.included?.length ? "(今の返信を置き換える)" : ""}:\n${text}`);
  if (!APPLY) { dryNote(); process.exit(0); }
  checkLocks();
  // 返信は1件だけ持てる。あれば消してから書く
  for (const old of r.included || []) await api(`/v1/customerReviewResponses/${old.id}`, { method: "DELETE" });
  await api("/v1/customerReviewResponses", { method: "POST", body: { data: { type: "customerReviewResponses", attributes: { responseBody: text },
    relationships: { review: { data: { type: "customerReviews", id: reviewId } } } } } });
  console.log("返信した(公開されるまで少しかかる)");
  process.exit(0);
}

const res = await api(`/v1/apps/${APP_ID}/customerReviews?sort=-createdDate&limit=20&include=response`);
const responded = new Set((res.included || []).map(x => x.relationships?.review?.data?.id).filter(Boolean));
const seen = new Set(existsSync(SEEN_FILE) ? JSON.parse(readFileSync(SEEN_FILE, "utf8")) : []);
const rows = res.data.map(r => ({
  id: r.id, rating: r.attributes.rating, title: r.attributes.title, body: r.attributes.body,
  reviewer: r.attributes.reviewerNickname, territory: r.attributes.territory, createdDate: r.attributes.createdDate,
  responded: responded.has(r.id), isNew: !seen.has(r.id),
}));
writeFileSync(SEEN_FILE, JSON.stringify([...new Set([...seen, ...rows.map(r => r.id)])]));

if (has("--json")) {
  console.log(JSON.stringify({ total: rows.length, newReviews: rows.filter(r => r.isNew), reviews: rows }, null, 2));
} else if (rows.length === 0) {
  console.log("本文つきのレビューはまだ無い");
} else {
  for (const r of rows) {
    const date = new Date(r.createdDate).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    console.log(`${r.isNew ? "新 " : "   "}★${r.rating} ${date} ${r.territory} ${r.reviewer}${r.responded ? "(返信済み)" : ""}  id=${r.id}`);
    console.log(`     ${r.title}: ${r.body.replace(/\s+/g, " ").slice(0, 200)}`);
  }
}
