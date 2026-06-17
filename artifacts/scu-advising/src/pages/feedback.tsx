import { useEffect, useState } from "react";
import { AppShell, PageHeader, PageContent } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Star, Send, Loader2, CheckCircle2 } from "lucide-react";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { value: "general", label: "General feedback" },
  { value: "bug", label: "Something is broken" },
  { value: "feature", label: "Feature request" },
  { value: "data", label: "Wrong / missing SCU data" },
  { value: "course", label: "Course or section issue" },
];

interface MyFeedback {
  id: number;
  category: string;
  message: string;
  rating: number | null;
  status: string;
  createdAt: string;
}

export default function FeedbackPage() {
  const { toast } = useToast();
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [mine, setMine] = useState<MyFeedback[]>([]);

  async function loadMine() {
    try {
      const res = await fetch(getApiUrl("/feedback/mine"));
      if (!res.ok) return;
      const data = (await res.json()) as { feedback: MyFeedback[] };
      setMine(data.feedback ?? []);
    } catch {
      /* non-fatal */
    }
  }

  useEffect(() => {
    void loadMine();
  }, []);

  async function submit() {
    if (message.trim().length < 4) {
      toast({
        title: "Add a little more detail",
        description: "Tell us what happened or what you'd like to see.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(getApiUrl("/feedback"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          message: message.trim(),
          rating: rating > 0 ? rating : undefined,
          page: window.location.pathname,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Request failed (${res.status})`);
      }
      toast({
        title: "Thanks for the feedback!",
        description: "We read every submission. It helps make CampusVal better.",
      });
      setMessage("");
      setRating(0);
      setCategory("general");
      void loadMine();
    } catch (err) {
      toast({
        title: "Couldn't send feedback",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Feedback"
        subtitle="Found a bug, want a feature, or spotted wrong data? Tell us — every submission is read."
      />
      <PageContent>
        <div className="grid lg:grid-cols-[1fr_20rem] gap-6">
          <Card className="p-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="fb-category">What's this about?</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="fb-category" data-testid="select-feedback-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fb-message">Your message</Label>
              <Textarea
                id="fb-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                placeholder="Be as specific as you can — what page, what you expected, and what happened."
                data-testid="input-feedback-message"
              />
            </div>

            <div className="space-y-2">
              <Label>How's your experience so far? (optional)</Label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n === rating ? 0 : n)}
                    className="p-1"
                    aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    data-testid={`feedback-star-${n}`}
                  >
                    <Star
                      className={cn(
                        "h-6 w-6 transition-colors",
                        n <= rating
                          ? "fill-[#B08850] text-[#B08850]"
                          : "text-muted-foreground/40",
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={submit}
              disabled={submitting}
              className="gap-2 bg-[#8C1515] hover:bg-[#7a1212]"
              data-testid="button-submit-feedback"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {submitting ? "Sending…" : "Send feedback"}
            </Button>
          </Card>

          <aside className="space-y-4">
            <Card className="p-5 text-sm text-muted-foreground space-y-2">
              <h3 className="font-semibold text-foreground">Good feedback includes</h3>
              <ul className="space-y-1.5 list-disc pl-4">
                <li>Which page or feature you were on</li>
                <li>What you expected to happen</li>
                <li>What actually happened</li>
                <li>For data issues: the exact course or professor</li>
              </ul>
            </Card>

            {mine.length > 0 && (
              <Card className="p-5">
                <h3 className="font-semibold mb-3 text-sm">Your submissions</h3>
                <ul className="space-y-3">
                  {mine.map((f) => (
                    <li key={f.id} className="text-xs border-b last:border-0 pb-2 last:pb-0">
                      <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                        <span className="uppercase tracking-wide">{f.category}</span>
                        <span>·</span>
                        <span>{new Date(f.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-foreground/80 line-clamp-2">{f.message}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </aside>
        </div>
      </PageContent>
    </AppShell>
  );
}
