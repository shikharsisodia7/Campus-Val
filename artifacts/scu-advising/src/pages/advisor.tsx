import { useEffect, useRef, useState } from "react";
import {
  useCreateOpenaiConversation,
  useDeleteOpenaiConversation,
  useGetOpenaiConversation,
  useListOpenaiConversations,
  getListOpenaiConversationsQueryKey,
  getGetOpenaiConversationQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ProfessorLookup } from "@/components/ProfessorLookup";
import {
  MessageSquareText,
  Plus,
  Send,
  Trash2,
  Sparkles,
  GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getApiUrl } from "@/lib/api";

const STARTER_PROMPTS = [
  "Can I take ENGR 1 and MATH 11 together my first quarter?",
  "What happens if I take a community college class after starting at SCU?",
  "How many transfer units can I bring in?",
  "I have a 2.95 GPA — can I overload to 22 units next quarter?",
  "Does AP Calc BC count for both MATH 11 and MATH 12?",
];

interface Message {
  id?: number;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

export default function Advisor() {
  const queryClient = useQueryClient();
  const { data: conversations = [] } = useListOpenaiConversations();
  const createConv = useCreateOpenaiConversation();
  const deleteConv = useDeleteOpenaiConversation();

  const [activeId, setActiveId] = useState<number | null>(null);

  useEffect(() => {
    if (activeId === null && conversations.length > 0) {
      setActiveId(conversations[0]!.id);
    }
  }, [conversations, activeId]);

  const { data: convDetail, refetch } = useGetOpenaiConversation(
    activeId ?? 0,
    {
      query: {
        enabled: activeId !== null,
        queryKey: getGetOpenaiConversationQueryKey(activeId ?? 0),
      },
    },
  );

  const [streamingContent, setStreamingContent] = useState("");
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages: Message[] = (convDetail?.messages ?? []).map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  if (isStreaming && streamingContent) {
    messages.push({
      role: "assistant",
      content: streamingContent,
      pending: true,
    });
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, streamingContent]);

  const newConversation = async () => {
    // Guard against rapid double-clicks: refuse while a create is already
    // in flight.
    if (createConv.isPending) return;
    // If the conversation we're already looking at has zero messages, just
    // stay on it instead of spawning another empty placeholder. This is the
    // truthful check — we ask the server (via the loaded detail) rather than
    // guessing from the sidebar title, so users with many real conversations
    // can still create new ones freely.
    if (
      activeId !== null &&
      convDetail &&
      (convDetail.messages?.length ?? 0) === 0
    ) {
      return;
    }
    // Belt and suspenders: if there's *any* existing conversation in the
    // sidebar that the server reports as empty, switch to it instead of
    // creating yet another placeholder. The sidebar list is authoritative
    // for titles but not message counts, so we trust convDetail when it
    // matches and fall back to title-sniffing for the rest.
    const looksEmpty = conversations.find(
      (c) => c.id !== activeId && (c.title ?? "") === "New conversation",
    );
    if (looksEmpty) {
      setActiveId(looksEmpty.id);
      return;
    }
    const created = await createConv.mutateAsync({
      data: { title: "New conversation" },
    });
    await queryClient.invalidateQueries({
      queryKey: getListOpenaiConversationsQueryKey(),
    });
    setActiveId(created.id);
  };

  const removeConv = async (id: number) => {
    await deleteConv.mutateAsync({ id });
    await queryClient.invalidateQueries({
      queryKey: getListOpenaiConversationsQueryKey(),
    });
    if (activeId === id) setActiveId(null);
  };

  const sendMessage = async (text: string) => {
    let convId = activeId;
    if (convId === null) {
      const created = await createConv.mutateAsync({
        data: { title: text.slice(0, 50) },
      });
      convId = created.id;
      setActiveId(convId);
      await queryClient.invalidateQueries({
        queryKey: getListOpenaiConversationsQueryKey(),
      });
    }

    setIsStreaming(true);
    setStreamingContent("");
    setDraft("");

    // Optimistic user message
    queryClient.setQueryData(
      getGetOpenaiConversationQueryKey(convId),
      (old: typeof convDetail) =>
        old
          ? {
              ...old,
              messages: [
                ...(old.messages ?? []),
                {
                  id: Date.now(),
                  conversationId: convId!,
                  role: "user" as const,
                  content: text,
                  createdAt: new Date().toISOString(),
                },
              ],
            }
          : old,
    );

    try {
      const resp = await fetch(
        getApiUrl(`/openai/conversations/${convId}/messages`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text }),
        },
      );
      if (!resp.body) throw new Error("No stream");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const evt of events) {
          const line = evt.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            const obj = JSON.parse(line.slice(6));
            if (obj.content) {
              acc += obj.content;
              setStreamingContent(acc);
            }
            if (obj.done) {
              // done
            }
            if (obj.error) {
              acc += `\n\n_Error: ${obj.error}_`;
              setStreamingContent(acc);
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStreamingContent((s) => s + `\n\n_Connection error: ${msg}_`);
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
      await refetch();
      await queryClient.invalidateQueries({
        queryKey: getListOpenaiConversationsQueryKey(),
      });
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="AI Advisor"
        subtitle="Grounded in verified SCU policies. The advisor knows your profile and uses it to personalize answers."
      />
      <div className="max-w-7xl mx-auto px-8 py-6 flex-1 min-h-0 flex flex-col">
        <Card className="p-0 overflow-hidden grid grid-cols-12 flex-1 min-h-[500px] max-h-[calc(100vh-180px)]">
          <aside className="col-span-3 border-r border-border bg-muted/20 flex flex-col min-h-0 min-w-0">
            <div className="p-3 border-b border-border">
              <Button
                onClick={newConversation}
                className="w-full"
                data-testid="button-new-chat"
              >
                <Plus className="h-4 w-4 mr-1" /> New chat
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {conversations.length === 0 ? (
                <div className="text-xs text-muted-foreground p-3 text-center">
                  No conversations yet.
                </div>
              ) : (
                conversations.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      "group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors",
                      activeId === c.id
                        ? "bg-primary/10 border border-primary/20"
                        : "hover:bg-accent/50 border border-transparent",
                    )}
                    onClick={() => setActiveId(c.id)}
                    data-testid={`conv-${c.id}`}
                  >
                    <MessageSquareText
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        activeId === c.id
                          ? "text-primary"
                          : "text-muted-foreground",
                      )}
                    />
                    <div className="text-sm font-medium text-foreground truncate flex-1">
                      {c.title}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeConv(c.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))
              )}
            </div>
            <ProfessorLookup />
          </aside>

          <section className="col-span-9 flex flex-col min-h-0 min-w-0">
            <div
              ref={scrollRef}
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-6"
            >
              {messages.length === 0 ? (
                <EmptyState onPick={sendMessage} disabled={isStreaming} />
              ) : (
                <div className="space-y-5 max-w-3xl mx-auto">
                  {messages.map((m, i) => (
                    <MessageBubble key={i} message={m} />
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-border p-4 bg-card">
              <div className="max-w-3xl mx-auto flex gap-2 items-end">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (draft.trim() && !isStreaming) sendMessage(draft.trim());
                    }
                  }}
                  rows={2}
                  placeholder="Ask about prerequisites, transfer credit, GPA, registration…"
                  className="resize-none"
                  data-testid="textarea-message"
                />
                <Button
                  onClick={() => draft.trim() && sendMessage(draft.trim())}
                  disabled={!draft.trim() || isStreaming}
                  data-testid="button-send"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </section>
        </Card>
      </div>
    </AppShell>
  );
}

function EmptyState({
  onPick,
  disabled,
}: {
  onPick: (s: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-full text-center max-w-xl mx-auto">
      <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
        <Sparkles className="h-7 w-7" />
      </div>
      <h2 className="font-serif text-2xl font-bold text-foreground">
        Ask CampusVal
      </h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-md leading-relaxed">
        Confident answers grounded in verified SCU policies. The advisor knows
        your profile and uses it to personalize advice.
      </p>
      <div className="mt-8 grid gap-2 w-full">
        {STARTER_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => onPick(p)}
            disabled={disabled}
            data-testid="starter-prompt"
            className="text-left text-sm border border-border rounded-md px-4 py-3 hover:border-primary/40 hover:bg-accent/40 transition-all group"
          >
            <div className="flex items-start gap-2.5">
              <GraduationCap className="h-4 w-4 text-primary/70 group-hover:text-primary mt-0.5 shrink-0 transition-colors" />
              <span className="text-foreground/85 group-hover:text-foreground transition-colors">
                {p}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="h-8 w-8 shrink-0 rounded-md bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold font-serif">
          CV
        </div>
      )}
      <div
        className={cn(
          "max-w-[80%] min-w-0 rounded-lg px-4 py-3 text-sm leading-relaxed break-words overflow-hidden",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm border border-border",
        )}
      >
        <RenderMarkdown text={message.content} />
        {message.pending && (
          <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-current animate-pulse align-middle" />
        )}
      </div>
    </div>
  );
}

function RenderMarkdown({ text }: { text: string }) {
  // Lightweight markdown rendering: headings, bold, italic, code, list, line breaks.
  const lines = text.split("\n");
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        if (line.startsWith("### "))
          return (
            <h4 key={i} className="font-semibold text-base mt-2">
              {inline(line.slice(4))}
            </h4>
          );
        if (line.startsWith("## "))
          return (
            <h3 key={i} className="font-semibold text-lg mt-2">
              {inline(line.slice(3))}
            </h3>
          );
        if (line.startsWith("# "))
          return (
            <h2 key={i} className="font-bold text-xl mt-2">
              {inline(line.slice(2))}
            </h2>
          );
        if (/^[-*]\s/.test(line))
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span>•</span>
              <span>{inline(line.replace(/^[-*]\s/, ""))}</span>
            </div>
          );
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return (
          <p key={i} className="whitespace-pre-wrap">
            {inline(line)}
          </p>
        );
      })}
    </div>
  );
}

function inline(text: string): React.ReactNode {
  // Bold **x**, italic *x*, inline code `x`
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/;
  while (remaining.length > 0) {
    const match = remaining.match(re);
    if (!match) {
      parts.push(remaining);
      break;
    }
    const idx = match.index ?? 0;
    if (idx > 0) parts.push(remaining.slice(0, idx));
    const tok = match[0];
    if (tok.startsWith("**"))
      parts.push(
        <strong key={key++}>{tok.slice(2, -2)}</strong>,
      );
    else if (tok.startsWith("`"))
      parts.push(
        <code
          key={key++}
          className="bg-background/60 px-1 py-0.5 rounded font-mono text-[0.9em]"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    else parts.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    remaining = remaining.slice(idx + tok.length);
  }
  return parts;
}
