import { useEffect, useState } from "react";
import {
  Wallet as WalletIcon,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  CreditCard,
  Landmark,
  Smartphone,
  Plus,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/lib/toast";
import { useWallet, fmt } from "@/lib/wallet";
import { api, ApiError } from "@/lib/api";

const METHODS = [
  { id: "visa", name: "Visa", info: "•••• 4242", icon: CreditCard },
  { id: "mastercard", name: "Mastercard", info: "•••• 8821", icon: CreditCard },
  { id: "paypal", name: "PayPal", info: "n••••@email.com", icon: WalletIcon },
  { id: "bank", name: "Bank transfer", info: "Instant · SEPA / ACH", icon: Landmark },
  { id: "applepay", name: "Apple Pay", info: "iPhone", icon: Smartphone },
];

const TABS = [
  { id: "deposit", label: "Deposit", icon: <ArrowDownLeft className="h-4 w-4" /> },
  { id: "withdraw", label: "Withdraw", icon: <ArrowUpRight className="h-4 w-4" /> },
  { id: "history", label: "History" },
];

const CHIPS = [20, 50, 100, 250];

export function Wallet() {
  const { push } = useToast();
  const { balance, deposit, withdraw } = useWallet();
  const [tab, setTab] = useState("deposit");
  const [method, setMethod] = useState("visa");
  const [amount, setAmount] = useState("");

  const sel = METHODS.find((m) => m.id === method)!;
  const [busy, setBusy] = useState(false);

  // real lifetime totals from the transaction ledger
  const [sums, setSums] = useState({ deposited: 0, withdrawn: 0, pending: 0 });
  useEffect(() => {
    api
      .get<{ type: string; status: string; amount: string }[]>("/transactions?limit=200")
      .then((rows) => {
        let d = 0, w = 0, p = 0;
        for (const t of rows) {
          const a = Number(t.amount);
          if (t.type === "DEPOSIT" && t.status === "COMPLETED") d += a;
          else if (t.type === "WITHDRAWAL" && t.status === "COMPLETED") w += a;
          else if (t.type === "WITHDRAWAL" && t.status === "PENDING") p += a;
        }
        setSums({ deposited: d, withdrawn: w, pending: p });
      })
      .catch(() => {});
  }, [balance]);

  const submit = async () => {
    const v = Number(amount);
    if (!(v > 0)) return push("Enter an amount", "danger");
    setBusy(true);
    try {
      if (tab === "deposit") {
        await deposit(v, method);
        push(`Deposited ${fmt(v)} via ${sel.name}`);
      } else {
        await withdraw(v, method);
        push(`Withdrawal of ${fmt(v)} to ${sel.name} submitted`);
      }
      setAmount("");
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Transaction failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Wallet</h1>
        <p className="mt-1 text-sm text-ink-soft">Fast, secure deposits & withdrawals.</p>
      </div>

      {/* balance hero */}
      <Card className="relative overflow-hidden" padded>
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-mut">Total balance</p>
            <p className="mt-1 font-stat text-4xl font-extrabold tracking-tight text-gradient">
              {fmt(balance)}
            </p>
            <p className="mt-1 text-xs text-ink-mut">Available to play & withdraw</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setTab("deposit")} iconLeft={<ArrowDownLeft className="h-4 w-4" />}>
              Deposit
            </Button>
            <Button
              variant="secondary"
              onClick={() => setTab("withdraw")}
              iconLeft={<ArrowUpRight className="h-4 w-4" />}
            >
              Withdraw
            </Button>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Balance", fmt(balance)],
            ["Deposited", fmt(sums.deposited)],
            ["Withdrawn", fmt(sums.withdrawn)],
            ["Pending", fmt(sums.pending)],
          ].map(([l, v]) => (
            <div key={l} className="rounded-md bg-glass/[0.04] p-3">
              <p className="font-stat text-sm font-bold">{v}</p>
              <p className="text-[11px] text-ink-mut">{l}</p>
            </div>
          ))}
        </div>
      </Card>

      <Tabs items={TABS} active={tab} onChange={setTab} />

      {tab === "history" ? (
        <TxHistory />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <Card padded>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-mut">
              {tab === "deposit" ? "Pay with" : "Withdraw to"}
            </p>

            {/* payment methods */}
            <div className="space-y-2">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={`flex w-full items-center gap-3 rounded-md p-3 text-left transition-colors ${
                    method === m.id
                      ? "bg-accent/10 ring-1 ring-accent/40"
                      : "bg-glass/[0.04] hover:bg-glass/10"
                  }`}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-glass/10 text-ink-soft">
                    <m.icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{m.name}</span>
                    <span className="block text-xs text-ink-mut">{m.info}</span>
                  </span>
                  {method === m.id && <Badge tone="accent">Selected</Badge>}
                </button>
              ))}
              <button
                onClick={() => push("Add payment method", "info")}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-line/25 py-2.5 text-sm font-semibold text-ink-mut hover:text-ink"
              >
                <Plus className="h-4 w-4" /> Add method
              </button>
            </div>

            {/* amount */}
            <label className="mb-1.5 mt-5 block text-xs font-semibold text-ink-soft">Amount</label>
            <div className="flex items-center rounded-md border border-line/15 bg-glass/[0.04] px-3.5">
              <span className="text-sm font-bold text-gold">$</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="h-11 w-full bg-transparent px-2 font-stat text-sm focus:outline-none"
              />
              {tab === "withdraw" && (
                <button
                  onClick={() => setAmount(String(balance))}
                  className="text-xs font-bold text-accent hover:underline"
                >
                  MAX
                </button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {CHIPS.map((c) => (
                <button
                  key={c}
                  onClick={() => setAmount(String(c))}
                  className="rounded-md bg-glass/[0.04] py-2 text-xs font-bold text-ink-soft hover:bg-glass/10 hover:text-ink"
                >
                  ${c}
                </button>
              ))}
            </div>

            <Button block size="lg" className="mt-5" onClick={submit} loading={busy}>
              {tab === "deposit" ? "Deposit" : "Withdraw"}{" "}
              {amount ? `$${Number(amount || 0).toFixed(2)}` : ""}
            </Button>
            <p className="mt-3 text-center text-xs text-ink-mut">
              {tab === "deposit"
                ? "Funds credited instantly. No fees."
                : "Processed within minutes. Daily limit $50,000."}
            </p>
          </Card>

          <Card padded>
            <h3 className="font-display text-base font-bold">Security</h3>
            <div className="mt-3 space-y-3 text-sm">
              {["2FA enabled", "Withdrawal confirmation", "Trusted devices"].map((l) => (
                <div key={l} className="flex items-center justify-between">
                  <span className="text-ink-soft">{l}</span>
                  <Badge tone="success">On</Badge>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-ink-mut">
              All transactions are encrypted and protected. 18+ · Play responsibly.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}

interface Txn {
  id: string;
  type: string;
  status: string;
  method: string;
  amount: string;
  createdAt: string;
}

function TxHistory() {
  const [rows, setRows] = useState<Txn[]>([]);
  useEffect(() => {
    api.get<Txn[]>("/transactions?limit=50").then(setRows).catch(() => setRows([]));
  }, []);

  const tone = (s: string) =>
    (s === "COMPLETED" ? "success" : s === "PENDING" ? "warning" : "danger") as "success";

  return (
    <Card padded={false}>
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2 font-display font-bold">
          <WalletIcon className="h-4 w-4 text-accent" /> Transactions
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mut" />
          <input
            placeholder="Search…"
            className="h-9 w-40 rounded-md border border-line/15 bg-glass/[0.04] pl-9 pr-3 text-sm focus:border-accent/60 focus:outline-none"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-y border-line/10 text-left text-[11px] uppercase tracking-wider text-ink-mut">
              <th className="px-4 py-2.5 font-bold">Type</th>
              <th className="px-4 py-2.5 font-bold">Method</th>
              <th className="px-4 py-2.5 font-bold">Date</th>
              <th className="px-4 py-2.5 text-right font-bold">Amount</th>
              <th className="px-4 py-2.5 text-right font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-ink-mut" colSpan={5}>
                  No transactions yet.
                </td>
              </tr>
            )}
            {rows.map((t) => {
              const positive = t.type === "DEPOSIT";
              return (
                <tr key={t.id} className="border-b border-line/5 transition-colors hover:bg-glass/[0.03]">
                  <td className="px-4 py-3 font-semibold capitalize">{t.type.toLowerCase()}</td>
                  <td className="px-4 py-3 text-ink-soft">{t.method}</td>
                  <td className="px-4 py-3 text-ink-mut">{new Date(t.createdAt).toLocaleString()}</td>
                  <td className={`px-4 py-3 text-right font-stat font-bold ${positive ? "text-success" : "text-ink"}`}>
                    {positive ? "+" : "-"}${t.amount}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Badge tone={tone(t.status)}>{t.status}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
