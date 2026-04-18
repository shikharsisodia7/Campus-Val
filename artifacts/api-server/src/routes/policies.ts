import { Router, type IRouter } from "express";
import { POLICIES } from "../data/policies";

const router: IRouter = Router();

router.get("/policies", (req, res) => {
  const search = (req.query.search as string | undefined)?.toLowerCase().trim();
  const category = (req.query.category as string | undefined)
    ?.toLowerCase()
    .trim();
  let result = POLICIES.slice();
  if (search) {
    result = result.filter(
      (p) =>
        p.title.toLowerCase().includes(search) ||
        p.summary.toLowerCase().includes(search) ||
        p.body.toLowerCase().includes(search) ||
        p.tags.some((t) => t.toLowerCase().includes(search)),
    );
  }
  if (category) {
    result = result.filter((p) => p.category.toLowerCase() === category);
  }
  res.json(
    result.map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      summary: p.summary,
      body: p.body,
      source: p.source,
      sourceUrl: p.sourceUrl ?? null,
      tags: p.tags,
    })),
  );
});

export default router;
