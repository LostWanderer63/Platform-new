import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { PageHeader, TableWrap, StatusChip, Card } from "@/components/ui";

interface Player {
  id: string;
  username: string;
  email: string;
  status: string;
  balance: string;
  createdAt: string;
}

export function PortalPlayers() {
  const { push } = useToast();
  const [rows, setRows] = useState<Player[]>([]);
  const [adding, setAdding] = useState(false);
  const blank = { username: "", email: "", password: "" };
  const [form, setForm] = useState(blank);

  const load = () => api.get<Player[]>("/portal/players").then(setRows).catch((e) => push(e.message, "bad"));
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/portal/players", form);
      push("Player created");
      setAdding(false);
      setForm(blank);
      load();
    } catch (err) {
      push((err as ApiError).message, "bad");
    }
  };

  return (
    <div>
      <PageHeader
        title="My Players"
        subtitle="Players you onboarded"
        action={<button className="btn-primary" onClick={() => setAdding((v) => !v)}><UserPlus className="h-4 w-4" /> New player</button>}
      />

      {adding && (
        <Card className="mb-4">
          <form onSubmit={create} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <input className="input" placeholder="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
            <input className="input" placeholder="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <input className="input" placeholder="password (8+)" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <button className="btn-primary">Create</button>
          </form>
        </Card>
      )}

      <TableWrap>
        <thead>
          <tr className="border-b border-line">
            <th className="th">Player</th>
            <th className="th">Balance</th>
            <th className="th">Status</th>
            <th className="th">Joined</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td className="td text-mut" colSpan={4}>No players yet — onboard your first.</td></tr>
          )}
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-line/50">
              <td className="td">
                <p className="font-semibold">{p.username}</p>
                <p className="text-xs text-mut">{p.email}</p>
              </td>
              <td className="td font-bold">${p.balance}</td>
              <td className="td"><StatusChip value={p.status} /></td>
              <td className="td text-xs text-mut">{new Date(p.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}
