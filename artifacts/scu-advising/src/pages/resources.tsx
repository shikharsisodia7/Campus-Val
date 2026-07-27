import { motion } from "framer-motion";
import { AppShell, PageContent, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ExternalLink,
  Landmark,
  Stethoscope,
  Info,
  ShieldCheck,
} from "lucide-react";
import {
  OFFICIAL_RESOURCES,
  PRE_PROFESSIONAL_TRACKS,
} from "@/data/advising-resources";

/**
 * Advising Resources — official SCU services plus pre-professional tracks.
 * Deliberately separate from Degree Requirements: nothing here affects
 * degree-progress tracking, and pre-professional guidance renders an honest
 * "content pending" state until approved SCU content exists.
 */
export default function ResourcesPage() {
  return (
    <AppShell>
      <PageHeader
        title="Advising Resources"
        subtitle="Official SCU services, and pre-professional (pre-health / pre-law) advising. This is guidance — it never changes your degree-progress tracking."
      />
      <PageContent>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Landmark className="h-4 w-4 text-primary" />
            Official SCU services
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {OFFICIAL_RESOURCES.map((r, i) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
              >
                <Card className="p-4 h-full cv-card-hover" data-testid={`resource-${r.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-sm leading-snug">
                      {r.title}
                    </div>
                    <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                    {r.description}
                  </p>
                  <div className="mt-2 text-[10px] text-muted-foreground">
                    Authority for: {r.authorityFor} · verified {r.lastVerified}
                  </div>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    Open official page
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Stethoscope className="h-4 w-4 text-primary" />
            Pre-professional tracks
          </div>
          {PRE_PROFESSIONAL_TRACKS.map((t) => (
            <Card key={t.id} className="p-5 space-y-3" data-testid={`track-${t.id}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="font-medium text-sm">{t.title}</div>
                {t.approvedContent.length === 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    Approved content pending
                  </Badge>
                )}
              </div>
              {t.approvedContent.length > 0 ? (
                <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
                  {t.approvedContent.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              ) : (
                <div className="flex gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>{t.pendingNote}</div>
                </div>
              )}
              <a
                href={t.officialUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                {t.officialLabel}
                <ExternalLink className="h-3 w-3" />
              </a>
            </Card>
          ))}
        </div>
      </PageContent>
    </AppShell>
  );
}
