import { useEffect, useState } from "react";
import { Plus, Ban, CheckCircle2, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { PageHeader, TableWrap, StatusChip, Card } from "@/components/ui";

interface Dist {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
  level: string;
  status: string;
  commissionPct: string;
  balance: string;
  contactEmail: string | null;
}

export function Distributors() {
  const { push } = useToast();
  const [rows, setRows] = useState<Dist[]>([]);
  const [adding, setAdding] = useState(false);
  const blank = { name: "", code: "", parentId: "", commissionPct: "", contactEmail: "", username: "", password: "" };
  const [form, setForm] = useState(blank);

  const load = () => api.get<Dist[]>("/admin/distributors").then(setRows).catch((e) => push(e.message, "bad"));
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/admin/distributors", {
        name: form.name,
        code: form.code,
        parentId: form.parentId || undefined,
        commissionPct: form.commissionPct || undefined,
        contactEmail: form.contactEmail || undefined,
        username: form.username || undefined,
        password: form.password || undefined,
      });
      push(form.username ? "Distributor + login created" : "Distributor created");
      setAdding(false);
      setForm(blank);
      load();
    } catch (err) {
      push((err as ApiError).message, "bad");
    }
  };

  const setStatus = async (d: Dist, status: string) => {
    try {
      await api.post(`/admin/distributors/${d.id}/status`, { status });
      push(`${d.name} → ${status}`);
      load();
    } catch (e) {
      push((e as ApiError).message, "bad");
    }
  };

  const remove = async (d: Dist) => {
    if (!confirm(`Delete distributor "${d.name}"?`)) return;
    try {
      await api.del(`/admin/distributors/${d.id}`);
      push("Deleted");
      load();
    } catch (e) {
      push((e as ApiError).message, "bad");
    }
  };

  return (
    <div>
      <PageHeader
        title="Distributors"
        subtitle="Manage distributors and sub-distributors"
        action={<button className="btn-primary" onClick={() => setAdding((v) => !v)}><Plus className="h-4 w-4" /> New</button>}
      />

      {adding && (
        <Card className="mb-4">
          <form onSubmit={create} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <input className="input" placeholder="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input className="input" placeholder="code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            <select className="input" value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
              <option value="">— Top-level distributor —</option>
              {rows.filter((r) => !r.parentId).map((r) => (
                <option key={r.id} value={r.id}>Sub of {r.name}</option>
              ))}
            </select>
            <input className="input" placeholder="commission %" value={form.commissionPct} onChange={(e) => setForm({ ...form, commissionPct: e.target.value })} />
            <input className="input" placeholder="contact email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            <input className="input" placeholder="login username (optional)" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <input className="input" type="password" placeholder="login password (6+)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button className="btn-primary">Create</button>
          </form>
          <p className="mt-2 px-1 text-xs text-mut">
            Add a username + password to give this distributor their own admin login (players cannot log in here).
          </p>
        </Card>
      )}

      <TableWrap>
        <thead>
          <tr className="border-b border-line">
            <th className="th">Name</th>
            <th className="th">Code</th>
            <th className="th">Level</th>
            <th className="th">Commission</th>
            <th className="th">Status</th>
            <th className="th text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} className="border-b border-line/50">
              <td className={`td ${d.parentId ? "pl-8 text-mut" : "font-semibold"}`}>
                {d.parentId && <span className="mr-1 text-mut">↳</span>}{d.name}
              </td>
              <td className="td font-mono text-xs">{d.code}</td>
              <td className="td text-mut">{d.level}</td>
              <td className="td">{d.commissionPct}%</td>
              <td className="td"><StatusChip value={d.status} /></td>
              <td className="td">
                <div className="flex justify-end gap-1">
                  {d.status === "ACTIVE" ? (
                    <button title="Suspend" className="btn-bad px-2 py-1" onClick={() => setStatus(d, "SUSPENDED")}><Ban className="h-4 w-4" /></button>
                  ) : (
                    <button title="Activate" className="btn-ghost px-2 py-1" onClick={() => setStatus(d, "ACTIVE")}><CheckCircle2 className="h-4 w-4" /></button>
                  )}
                  <button title="Delete" className="btn-ghost px-2 py-1" onClick={() => remove(d)}><Trash2 className="h-4 w-4" /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}
