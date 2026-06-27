import { useEffect, useState } from "react";
import { Search, Coins, Ban, CheckCircle2, UserPlus, Eye, EyeOff } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { PageHeader, TableWrap, StatusChip, Card } from "@/components/ui";

interface Player {
  id: string;
  username: string;
  email: string;
  status: string;
  role: string;
  balance: string;
  createdAt: string;
}

export function Players() {
  const { push } = useToast();
  const [players, setPlayers] = useState<Player[]>([]);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dists, setDists] = useState<{ id: string; name: string; code: string }[]>([]);
  const blank = { username: "", email: "", password: "", startingBalance: "", distributorId: "" };
  const [form, setForm] = useState(blank);

  const load = (query = "") =>
    api.get<Player[]>(`/admin/players${query ? `?q=${encodeURIComponent(query)}` : ""}`).then(setPlayers).catch((e) => push(e.message, "bad"));
  useEffect(() => {
    load();
    api.get<{ id: string; name: string; code: string }[]>("/admin/distributors").then(setDists).catch(() => {});
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/admin/players", {
        username: form.username,
        email: form.email,
        password: form.password,
        ...(form.startingBalance ? { startingBalance: form.startingBalance } : {}),
        ...(form.distributorId ? { distributorId: form.distributorId } : {}),
      });
      push(`Player ${form.username} created`);
      setForm(blank);
      setAdding(false);
      load(q);
    } catch (err) {
      push((err as ApiError).message, "bad");
    } finally {
      setBusy(false);
    }
  };

  const adjust = async (p: Player) => {
    const raw = prompt(`Adjust points for ${p.username} (current $${p.balance}).\nEnter amount (negative to debit):`);
    if (raw == null) return;
    const reason = prompt("Reason (required):") || "";
    if (reason.trim().length < 2) return push("Reason required", "bad");
    try {
      const r = await api.post<{ balance: string }>(`/admin/players/${p.id}/adjust`, { amount: raw, reason });
      push(`${p.username} balance → $${r.balance}`);
      load(q);
    } catch (e) {
      push((e as ApiError).message, "bad");
    }
  };

  const setStatus = async (p: Player, status: string) => {
    if (!confirm(`Set ${p.username} to ${status}?`)) return;
    try {
      await api.post(`/admin/players/${p.id}/status`, { status });
      push(`${p.username} → ${status}`);
      load(q);
    } catch (e) {
      push((e as ApiError).message, "bad");
    }
  };

  return (
    <div>
      <PageHeader
        title="Players"
        subtitle="Create, search, adjust points, block or reinstate"
        action={
          <button className="btn-primary" onClick={() => setAdding((v) => !v)}>
            <UserPlus className="h-4 w-4" /> New player
          </button>
        }
      />

      {adding && (
        <Card className="mb-4">
          <form onSubmit={create} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input className="input" placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required minLength={3} />
            <input className="input" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <div className="relative">
              <input className="input pr-9" type={show ? "text" : "password"} placeholder="Password (8+)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-mut hover:text-ink" aria-label={show ? "Hide" : "Show"}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <input className="input" type="number" min="0" step="0.01" placeholder="Starting balance (optional)" value={form.startingBalance} onChange={(e) => setForm({ ...form, startingBalance: e.target.value })} />
            <select className="input" value={form.distributorId} onChange={(e) => setForm({ ...form, distributorId: e.target.value })}>
              <option value="">No distributor</option>
              {dists.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
            </select>
            <button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create player"}</button>
          </form>
        </Card>
      )}

      <form onSubmit={(e) => { e.preventDefault(); load(q); }} className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mut" />
          <input className="input pl-9" placeholder="Search username or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn-primary">Search</button>
      </form>

      <TableWrap>
        <thead>
          <tr className="border-b border-line">
            <th className="th">Player</th>
            <th className="th">Joined</th>
            <th className="th">Balance</th>
            <th className="th">Status</th>
            <th className="th text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {players.length === 0 && (
            <tr><td className="td text-mut" colSpan={5}>No players yet — create one.</td></tr>
          )}
          {players.map((p) => (
            <tr key={p.id} className="border-b border-line/50">
              <td className="td">
                <p className="font-semibold">{p.username}</p>
                <p className="text-xs text-mut">{p.email}</p>
              </td>
              <td className="td text-xs text-mut">{new Date(p.createdAt).toLocaleDateString()}</td>
              <td className="td font-bold">${p.balance}</td>
              <td className="td"><StatusChip value={p.status} /></td>
              <td className="td">
                <div className="flex justify-end gap-1">
                  <button title="Adjust points" className="btn-ghost px-2 py-1" onClick={() => adjust(p)}><Coins className="h-4 w-4" /></button>
                  {p.status === "ACTIVE" ? (
                    <button title="Block" className="btn-bad px-2 py-1" onClick={() => setStatus(p, "SUSPENDED")}><Ban className="h-4 w-4" /></button>
                  ) : (
                    <button title="Reinstate" className="btn-ghost px-2 py-1" onClick={() => setStatus(p, "ACTIVE")}><CheckCircle2 className="h-4 w-4" /></button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}
