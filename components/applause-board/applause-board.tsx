"use client";

import { Megaphone, Plus, Send, Sparkles, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getCached, setCached } from "@/lib/data-cache";

type Audience = "everyone" | "group" | "person";
type TeamMember = {
  designation: string;
  email: string;
  id: string;
  name: string;
  team: string;
};
type ApplausePost = {
  audience: Audience;
  author_name?: string;
  created_at?: string;
  id: string;
  message: string;
  recipient_ids?: string[];
  recipient_names?: string;
  tagged_ids?: string[];
  tagged_names?: string;
};

const audienceOptions: { key: Audience; label: string }[] = [
  { key: "everyone", label: "To Everyone" },
  { key: "group", label: "To Close group" },
  { key: "person", label: "To someone specifically" }
];

export function ApplauseBoard() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [posts, setPosts] = useState<ApplausePost[]>([]);
  const [audience, setAudience] = useState<Audience>("everyone");
  const [recipientSelect, setRecipientSelect] = useState("");
  const [tagSelect, setTagSelect] = useState("");
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [taggedIds, setTaggedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const dataHydratedRef = useRef(false);

  useEffect(() => {
    fetch("/api/teams")
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { members?: TeamMember[] } | null) => {
        if (result?.members) {
          setMembers(result.members);
        }
      })
      .catch(() => undefined);

    void loadPosts();
  }, []);

  const selectedRecipients = useMemo(
    () => members.filter((member) => recipientIds.includes(member.id)),
    [members, recipientIds]
  );
  const taggedMembers = useMemo(() => members.filter((member) => taggedIds.includes(member.id)), [members, taggedIds]);

  async function loadPosts() {
    if (!dataHydratedRef.current) {
      const cached = getCached<ApplausePost[]>("applause");

      if (cached) {
        setPosts(cached);
      }
    }

    dataHydratedRef.current = true;

    try {
      const response = await fetch("/api/applause-board");
      const result = (await response.json()) as { posts?: ApplausePost[] };

      if (response.ok && result.posts) {
        setCached("applause", result.posts);
        setPosts(result.posts);
      }
    } catch {
      // Local view remains available until the shared applause table is applied.
    }
  }

  function addRecipient() {
    if (!recipientSelect) {
      return;
    }

    setRecipientIds((current) => {
      if (audience === "person") {
        return [recipientSelect];
      }

      return current.includes(recipientSelect) ? current : [...current, recipientSelect];
    });
    setRecipientSelect("");
  }

  function addTaggedPerson() {
    if (!tagSelect) {
      return;
    }

    setTaggedIds((current) => (current.includes(tagSelect) ? current : [...current, tagSelect]));
    setTagSelect("");
  }

  async function sendApplause() {
    if (!message.trim()) {
      return;
    }

    const recipientNames = audience === "everyone" ? "Everyone" : selectedRecipients.map(displayName).join(", ");
    const taggedNames = taggedMembers.map(displayName).join(", ");
    const optimisticPost: ApplausePost = {
      audience,
      author_name: "You",
      created_at: new Date().toISOString(),
      id: crypto.randomUUID(),
      message: message.trim(),
      recipient_ids: audience === "everyone" ? [] : recipientIds,
      recipient_names: recipientNames,
      tagged_ids: taggedIds,
      tagged_names: taggedNames
    };

    setPosts((current) => [optimisticPost, ...current]);
    setMessage("");
    setRecipientIds([]);
    setTaggedIds([]);
    setAudience("everyone");

    try {
      const response = await fetch("/api/applause-board", {
        body: JSON.stringify({
          audience,
          message: optimisticPost.message,
          recipientIds,
          recipientNames,
          taggedIds,
          taggedNames
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const result = (await response.json()) as { post?: ApplausePost };

      if (response.ok && result.post) {
        setPosts((current) => current.map((post) => (post.id === optimisticPost.id ? result.post! : post)));
      }
    } catch {
      // Local fallback remains visible on this device.
    }
  }

  return (
    <section className="mt-5 grid gap-5 xl:grid-cols-[430px_minmax(0,1fr)]">
      <aside className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-pink-100 text-pink-800">
            <Megaphone className="size-5" />
          </div>
          <div>
            <p className="text-xs font-black uppercase text-pink-700">Applause Board</p>
            <h2 className="text-xl font-black text-slate-950">Share appreciation</h2>
          </div>
        </div>

        <div className="mt-5 grid gap-2">
          {audienceOptions.map((option) => (
            <button
              className={`h-11 rounded-2xl px-4 text-left text-sm font-black transition ${
                audience === option.key ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
              key={option.key}
              onClick={() => {
                setAudience(option.key);
                setRecipientIds([]);
                setRecipientSelect("");
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        {audience !== "everyone" ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-black uppercase text-slate-500">Recipients</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <select
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 outline-none focus:border-pink-500"
                onChange={(event) => setRecipientSelect(event.target.value)}
                value={recipientSelect}
              >
                <option value="">Select person</option>
                {members
                  .filter((member) => !recipientIds.includes(member.id))
                  .map((member) => (
                    <option key={member.id} value={member.id}>
                      {displayName(member)}
                    </option>
                  ))}
              </select>
              <button className="flex h-10 items-center justify-center rounded-xl bg-pink-700 px-3 text-sm font-black text-white" onClick={addRecipient} type="button">
                <Plus className="size-4" />
              </button>
            </div>
            <ChipList members={selectedRecipients} onRemove={(id) => setRecipientIds((current) => current.filter((item) => item !== id))} />
          </div>
        ) : null}

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-black uppercase text-slate-500">Tag people</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <select
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 outline-none focus:border-pink-500"
              onChange={(event) => setTagSelect(event.target.value)}
              value={tagSelect}
            >
              <option value="">Select person</option>
              {members
                .filter((member) => !taggedIds.includes(member.id))
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    {displayName(member)}
                  </option>
                ))}
            </select>
            <button className="flex h-10 items-center justify-center rounded-xl bg-slate-950 px-3 text-sm font-black text-white" onClick={addTaggedPerson} type="button">
              <Plus className="size-4" />
            </button>
          </div>
          <ChipList members={taggedMembers} onRemove={(id) => setTaggedIds((current) => current.filter((item) => item !== id))} />
        </div>

        <textarea
          className="mt-5 min-h-36 w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold leading-6 outline-none focus:border-pink-500"
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Write applause message"
          value={message}
        />
        <button
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
          onClick={sendApplause}
          type="button"
        >
          <Send className="size-4" />
          Post applause
        </button>
      </aside>

      <div className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
        <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-pink-700">Visible messages</p>
            <h2 className="text-2xl font-black text-slate-950">Applause feed</h2>
          </div>
          <p className="text-sm font-semibold text-slate-500">{posts.length} messages</p>
        </div>

        <div className="mt-4 space-y-3">
          {posts.length ? (
            posts.map((post) => (
              <article className="rounded-2xl bg-slate-50 p-4" key={post.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-pink-100 px-3 py-1 text-xs font-black text-pink-800">
                    <Sparkles className="size-3.5" />
                    {audienceLabel(post)}
                  </span>
                  {post.tagged_names ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600">
                      <UsersRound className="size-3.5" />
                      {post.tagged_names}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-base font-black leading-7 text-slate-950">{post.message}</p>
                <p className="mt-3 text-xs font-bold uppercase text-slate-500">
                  {post.author_name ?? "WorkLine User"} | {formatDate(post.created_at)}
                </p>
              </article>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">
              No applause messages visible yet.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ChipList({ members, onRemove }: { members: TeamMember[]; onRemove: (id: string) => void }) {
  return members.length ? (
    <div className="mt-2 flex flex-wrap gap-2">
      {members.map((member) => (
        <button
          className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-700"
          key={member.id}
          onClick={() => onRemove(member.id)}
          type="button"
        >
          {displayName(member)}
          <X className="size-3.5" />
        </button>
      ))}
    </div>
  ) : null;
}

function displayName(member: TeamMember) {
  return member.name || member.email;
}

function audienceLabel(post: ApplausePost) {
  if (post.audience === "everyone") {
    return "To Everyone";
  }

  if (post.audience === "person") {
    return `To ${post.recipient_names || "selected person"}`;
  }

  return `To ${post.recipient_names || "close group"}`;
}

function formatDate(value?: string) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}
