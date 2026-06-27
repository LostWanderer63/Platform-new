import { useEffect, useState } from "react";
import { Plus, Pause, Play, Wrench, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { PageHeader, TableWrap, StatusChip, Card } from "@/components/ui";

interface Game {
  id: string;
  slug: string;
  name: string;
  category: string;
  provider: string;
  kind: string;
  status: string;
  hot: boolean;
  live: boolean;
}

const KINDS = ["CRASH", "DICE", "MINES", "PLINKO", "ROULETTE", "WHEEL", "COINFLIP", "BLACKJACK", "SLOTS", "LIVE"];

export function Games() {
  const { push } = useToast();
  const [games, setGames] = useState<Game[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ slug: "", name: "", category: "Slots", provider: "Aurora", kind: "SLOTS" });

  const load = () => api.get<Game[]>("/admin/games").then(setGames).catch((e) => push(e.message, "bad"));
  useEffect(() => { load(); }, []);

  const setStatus = async (id: string, status: string) => {
    try {
      await api.post(`/admin/games/${id}/status`, { status });
      push(`Game → ${status}`);
      load();
    } catch (e) {
      push((e as ApiError).message, "bad");
    }
  };

  const remove = async (g: Game) => {
    if (!confirm(`Delete "${g.name}"? This cannot be undone.`)) return;
    try {
      await api.del(`/admin/games/${g.id}`);
      push("Game deleted");
      load();
    } catch (e) {
      push((e as ApiError).message, "bad");
    }
  };

  const bulk = async (status: string) => {
    try {
      const r = await api.post<{ updated: number }>("/admin/games/bulk-status", { ids: [...sel], status });
      push(`${r.updated} games → ${status}`);
      setSel(new Set());
      load();
    } catch (e) {
      push((e as ApiError).message, "bad");
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/admin/games", form);
      push("Game added");
      setAdding(false);
      setForm({ slug: "", name: "", category: "Slots", provider: "Aurora", kind: "SLOTS" });
      load();
    } catch (err) {
      push((err as ApiError).message, "bad");
    }
  };

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div>
      <PageHeader
        title="Games"
        subtitle={`${games.length} games · pause, maintenance, add or remove`}
        action={
          <button className="btn-primary" onClick={() => setAdding((v) => !v)}>
            <Plus className="h-4 w-4" /> Add game
          </button>
        }
      />

      {adding && (
        <Card className="mb-4">
          <form onSubmit={add} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <input className="input" placeholder="slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
            <input className="input" placeholder="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input className="input" placeholder="category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required />
            <input className="input" placeholder="provider" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} required />
            <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
            <button className="btn-primary col-span-2 sm:col-span-1">Create</button>
          </form>
        </Card>
      )}

      {sel.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
          <span className="font-semibold">{sel.size} selected</span>
          <button className="btn-ghost" onClick={() => bulk("MAINTENANCE")}><Wrench className="h-4 w-4" /> Maintenance</button>
          <button className="btn-ghost" onClick={() => bulk("PAUSED")}><Pause className="h-4 w-4" /> Pause</button>
          <button className="btn-ghost" onClick={() => bulk("ACTIVE")}><Play className="h-4 w-4" /> Activate</button>
        </div>
      )}

      <TableWrap>
        <thead>
          <tr className="border-b border-line">
            <th className="th w-8"></th>
            <th className="th">Game</th>
            <th className="th">Category</th>
            <th className="th">Provider</th>
            <th className="th">Status</th>
            <th className="th text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {games.map((g) => (
            <tr key={g.id} className="border-b border-line/50">
              <td className="td">
                <input type="checkbox" checked={sel.has(g.id)} onChange={() => toggle(g.id)} />
              </td>
              <td className="td">
                <p className="font-semibold">{g.name}</p>
                <p className="text-xs text-mut">{g.slug} · {g.kind}</p>
              </td>
              <td className="td text-mut">{g.category}</td>
              <td className="td text-mut">{g.provider}</td>
              <td className="td"><StatusChip value={g.status} /></td>
              <td className="td">
                <div className="flex justify-end gap-1">
                  {g.status !== "ACTIVE" && (
                    <button title="Activate" className="btn-ghost px-2 py-1" onClick={() => setStatus(g.id, "ACTIVE")}><Play className="h-4 w-4" /></button>
                  )}
                  {g.status !== "PAUSED" && (
                    <button title="Pause" className="btn-ghost px-2 py-1" onClick={() => setStatus(g.id, "PAUSED")}><Pause className="h-4 w-4" /></button>
                  )}
                  {g.status !== "MAINTENANCE" && (
                    <button title="Maintenance" className="btn-ghost px-2 py-1" onClick={() => setStatus(g.id, "MAINTENANCE")}><Wrench className="h-4 w-4" /></button>
                  )}
                  <button title="Delete" className="btn-bad px-2 py-1" onClick={() => remove(g)}><Trash2 className="h-4 w-4" /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}
