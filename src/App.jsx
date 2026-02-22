import { useState, useMemo, useEffect } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, Building2, Calendar,
  AlertCircle, CheckCircle, BarChart3, Settings, Clock, Layers,
  ChevronRight, Target, Activity, Save
} from "lucide-react";

const fmt = (v, type = "currency") => {
  if (type === "currency") {
    if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toFixed(2)}M`;
    return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  if (type === "pct") return `${(v * 100).toFixed(1)}%`;
  if (type === "pct1") return `${(v).toFixed(1)}%`;
  return v.toLocaleString("pt-BR");
};

const MONTHLY_COSTS = [248500, 248500, 90279, 163793, 247624, 303082, 323717, 353380, 375305, 295343, 252783, 174111, 0, 0, 0, 0];
const CONSTRUCTION_ITEMS = [
  { name: "Fundações", pct: 0.07 },
  { name: "Alvenaria Estrutural", pct: 0.30 },
  { name: "Estrutura Concreto", pct: 0.11 },
  { name: "Inst. Hidrossanitárias", pct: 0.09 },
  { name: "Inst. Elétricas", pct: 0.07 },
  { name: "Revestimentos", pct: 0.13 },
  { name: "Esquadrias", pct: 0.05 },
  { name: "Pintura", pct: 0.05 },
  { name: "Cobertura", pct: 0.05 },
  { name: "Pisos", pct: 0.06 },
  { name: "Acabamentos", pct: 0.02 },
];

export default function App() {
  const [params, setParams] = useState({
    blocos: 1,
    pavimentos: 4,
    unidadesPav: 8,
    areaPrivativa: 44.075,
    valorUnidade: 159000,
    custoM2: 1620,
    terreno: 480000,
    custosIndiretos: 17000,
    prazo: 16,
    tma: 15,
  });

  const [lastSavedParamsStr, setLastSavedParamsStr] = useState(() => JSON.stringify(params));
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const unsavedChanges = JSON.stringify(params) !== lastSavedParamsStr;

  useEffect(() => {
    // Carregar dados salvos no servidor ao iniciar o app, ignorando cache
    fetch(`/api/load.php?t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        if (data && typeof data === 'object' && data.blocos !== undefined) {
          setParams(data);
          setLastSavedParamsStr(JSON.stringify(data));
        }
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Erro ao carregar do servidor:", err);
        setIsLoading(false); // Carrega os valores padrão se falhar
      });
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (unsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [unsavedChanges]);

  const calc = useMemo(() => {
    const totalUnidades = params.blocos * params.pavimentos * params.unidadesPav;
    const areaEquiv = params.areaPrivativa * 1.1361;
    const areaEquivTotal = areaEquiv * totalUnidades;
    const subtotalConstrucao = params.custoM2 * areaEquivTotal;
    const custoTotal = params.terreno + subtotalConstrucao + params.custosIndiretos;
    const receitaBruta = params.valorUnidade * totalUnidades;
    const impostoVenda = receitaBruta * 0.01;
    const comissao = receitaBruta * 0.05;
    const outros = (1850 + 750 + 1900) * totalUnidades;
    const receitaLiquida = receitaBruta - impostoVenda - comissao - outros;
    const lucroBruto = receitaLiquida - custoTotal;
    const margem = lucroBruto / receitaLiquida;
    const roi = lucroBruto / custoTotal;
    const exposicaoMax = -custoTotal;

    // VPL/TIR approximation using actual cash flows scaled
    const scale = custoTotal / 3076418;
    const fluxos = MONTHLY_COSTS.map((c, i) => {
      const receita = i >= 13 && i <= 16 ? (receitaLiquida / 4) : 0;
      return receita - c * scale;
    });

    const tmaM = (1 + params.tma / 100) ** (1 / 12) - 1;
    let vpl = 0;
    fluxos.forEach((f, i) => { vpl += f / (1 + tmaM) ** (i + 1); });

    // Simple TIR approximation
    const tirM = 0.047173 * (roi / 0.506);
    const tirA = (1 + tirM) ** 12 - 1;

    const custoUnitario = custoTotal / totalUnidades;
    const lucroPorUnidade = lucroBruto / totalUnidades;

    return {
      totalUnidades, areaEquivTotal, subtotalConstrucao, custoTotal,
      receitaBruta, receitaLiquida, lucroBruto, margem, roi,
      exposicaoMax, vpl, tirM, tirA, custoUnitario, lucroPorUnidade,
      fluxos, scale,
    };
  }, [params]);

  // Cash flow chart data
  const cashFlowData = useMemo(() => {
    const labels = Array.from({ length: 16 }, (_, i) => `M${i + 1}`);
    let acc = 0;
    return labels.map((label, i) => {
      const scale = calc.scale;
      const custo = MONTHLY_COSTS[i] * scale;
      const receita = i >= 13 && i <= 15 ? calc.receitaLiquida / 4 : 0;
      const saldo = receita - custo;
      acc += saldo;
      return { label, custo: -custo, receita, saldo, acumulado: acc };
    });
  }, [calc]);

  // Sensitivity data
  const sensData = useMemo(() => {
    const variations = [-0.15, -0.10, -0.05, 0, 0.05, 0.10, 0.15, 0.20];
    return variations.map(v => {
      const custoAdj = calc.custoTotal * (1 + v);
      const lucroAdj = calc.receitaLiquida - custoAdj;
      const roiAdj = lucroAdj / custoAdj;
      const margemAdj = lucroAdj / calc.receitaLiquida;
      return {
        variacao: `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`,
        custo: custoAdj,
        lucro: lucroAdj,
        roi: roiAdj * 100,
        margem: margemAdj * 100,
        isBase: v === 0,
      };
    });
  }, [calc]);

  const update = (key, val) => setParams(p => ({ ...p, [key]: Number(val) }));

  const kpis = [
    {
      label: "VPL", value: fmt(calc.vpl), icon: TrendingUp,
      sub: `TMA ${params.tma}% a.a.`,
      color: calc.vpl > 0 ? "emerald" : "red",
      badge: calc.vpl > 0 ? "✓ Viável" : "✗ Inviável",
    },
    {
      label: "TIR Anualizada", value: fmt(calc.tirA * 100, "pct1") + " a.a.", icon: Activity,
      sub: `${fmt(calc.tirM * 100, "pct1")} a.m.`,
      color: calc.tirA > params.tma / 100 ? "emerald" : "amber",
      badge: calc.tirA > params.tma / 100 ? "✓ TIR > TMA" : "⚠ TIR < TMA",
    },
    {
      label: "ROI", value: fmt(calc.roi, "pct"), icon: Target,
      sub: "Retorno s/ investimento",
      color: calc.roi > 0.5 ? "emerald" : "amber",
      badge: `Meta ≥ 50%`,
    },
    {
      label: "Margem Líquida", value: fmt(calc.margem, "pct"), icon: BarChart3,
      sub: "Lucro / Receita Líquida",
      color: calc.margem > 0.3 ? "emerald" : "amber",
      badge: `Meta ≥ 30%`,
    },
    {
      label: "Lucro Bruto", value: fmt(calc.lucroBruto), icon: DollarSign,
      sub: `${fmt(calc.lucroPorUnidade)} / unidade`,
      color: calc.lucroBruto > 0 ? "emerald" : "red",
    },
    {
      label: "Exposição Máx.", value: fmt(Math.abs(calc.exposicaoMax)), icon: AlertCircle,
      sub: "Capital necessário",
      color: "blue",
    },
  ];

  const colorMap = {
    emerald: { bg: "#f0fdf4", border: "#86efac", text: "#15803d", badge: "#dcfce7", badgeText: "#166534" },
    red: { bg: "#fef2f2", border: "#fca5a5", text: "#b91c1c", badge: "#fee2e2", badgeText: "#991b1b" },
    amber: { bg: "#fffbeb", border: "#fcd34d", text: "#b45309", badge: "#fef9c3", badgeText: "#92400e" },
    blue: { bg: "#eff6ff", border: "#93c5fd", text: "#1d4ed8", badge: "#dbeafe", badgeText: "#1e40af" },
  };

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "config", label: "Configuração", icon: Settings },
    { id: "fluxo", label: "Fluxo de Caixa", icon: Activity },
    { id: "sensibilidade", label: "Sensibilidade", icon: Layers },
  ];

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F9FAFB", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ width: 40, height: 40, border: "3px solid #E5E7EB", borderTopColor: "#1d4ed8", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <div style={{ color: "#6B7280", fontWeight: 500 }}>Carregando simulação...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F9FAFB", fontFamily: "'DM Sans', 'Outfit', system-ui, sans-serif", overflowX: "hidden", width: "100vw", maxWidth: "100%" }}>
      {/* Header */}
      <header style={{
        background: "#fff", borderBottom: "1px solid #E5E7EB",
        position: "sticky", top: 0, zIndex: 50,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
      }}>
        <div className="mobile-px-16 mobile-flex-wrap mobile-header-stack" style={{ padding: "0 24px", maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", border: "1px solid #E5E7EB"
            }}>
              <img src="/wf-logo.jpg" alt="WF logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", letterSpacing: "-0.3px" }}>
                WF Construções
              </div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: -1 }}>
                Alvenaria Estrutural 4 Pavimentos
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="mobile-hide" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20,
                background: "#EFF6FF", color: "#1d4ed8", border: "1px solid #BFDBFE"
              }}>
                RESIDENCIAL MONTE CASTELO 2
              </span>
              <span style={{ fontSize: 11, color: "#6B7280" }}>João Pessoa · PB</span>
            </div>
            <button
              disabled={isSaving}
              onClick={async () => {
                if (!unsavedChanges) return;
                setIsSaving(true);
                try {
                  const res = await fetch('/api/save.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(params)
                  });
                  if (!res.ok) throw new Error("Network response was not ok");
                  setLastSavedParamsStr(JSON.stringify(params));
                } catch (err) {
                  alert("Erro de conexão ao tentar salvar os dados no servidor!");
                  console.error(err);
                }
                setIsSaving(false);
              }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: unsavedChanges ? "#1d4ed8" : "#E5E7EB",
                color: unsavedChanges ? "#fff" : "#6B7280",
                padding: "8px 12px", borderRadius: 6,
                border: "none", fontWeight: 600, fontSize: 13,
                cursor: (unsavedChanges && !isSaving) ? "pointer" : "default",
                opacity: isSaving ? 0.7 : 1, transition: "all 0.2s"
              }}
              title={unsavedChanges ? "Salvar alterações" : "Nenhuma alteração pendente"}
            >
              <Save size={16} />
              <span className="mobile-hide">{isSaving ? "Salvando..." : unsavedChanges ? "Salvar" : "Salvo"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Tab Nav */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB" }}>
        <div className="mobile-px-16 mobile-flex-wrap" style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px", display: "flex", gap: 0, justifyContent: "space-between" }}>
          {tabs.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                className="tab-button"
                onClick={() => setTab(t.id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px 10px",
                  borderBottom: active ? "2px solid #1d4ed8" : "2px solid transparent",
                  color: active ? "#1d4ed8" : "#6B7280",
                  fontWeight: active ? 600 : 500, fontSize: 13,
                  background: "none", border: "none", borderRadius: 0,
                  cursor: "pointer", transition: "all 0.15s", marginBottom: -1,
                  whiteSpace: "nowrap", flexGrow: 1, textAlign: "center"
                }}
              >
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mobile-p-16" style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 24px" }}>

        {/* ─────────────── DASHBOARD ─────────────── */}
        {tab === "dashboard" && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Painel de Viabilidade</h2>
              <p style={{ fontSize: 13, color: "#6B7280", margin: "4px 0 0" }}>
                {calc.totalUnidades} unidades · {params.prazo} meses · Área {params.areaPrivativa}m² privativa
              </p>
            </div>

            {/* KPI Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 28 }}>
              {kpis.map((kpi, i) => {
                const Icon = kpi.icon;
                const c = colorMap[kpi.color];
                return (
                  <div key={i} style={{
                    background: "#fff", borderRadius: 16, padding: "22px 24px",
                    border: "1px solid #E5E7EB",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                    transition: "box-shadow 0.2s",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.6px" }}>
                          {kpi.label}
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: "#111827", marginTop: 6, letterSpacing: "-0.8px", lineHeight: 1.1 }}>
                          {kpi.value}
                        </div>
                        {kpi.sub && <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>{kpi.sub}</div>}
                      </div>
                      <div style={{
                        width: 40, height: 40, borderRadius: 12, background: c.bg,
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                      }}>
                        <Icon size={18} color={c.text} />
                      </div>
                    </div>
                    {kpi.badge && (
                      <div style={{
                        marginTop: 14, display: "inline-flex", alignItems: "center",
                        padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                        background: c.badge, color: c.badgeText
                      }}>
                        {kpi.badge}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Decision Panel */}
            <div style={{
              background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB",
              padding: "22px 24px", marginBottom: 28,
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)"
            }}>
              <div style={{ fontWeight: 700, color: "#111827", fontSize: 15, marginBottom: 16 }}>
                Painel de Decisão
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                {[
                  { label: "Margem ≥ 30%", val: calc.margem >= 0.30, display: fmt(calc.margem, "pct") },
                  { label: "ROI ≥ 30%", val: calc.roi >= 0.30, display: fmt(calc.roi, "pct") },
                  { label: "VPL > 0", val: calc.vpl > 0, display: fmt(calc.vpl) },
                  { label: "TIR > TMA", val: calc.tirA > params.tma / 100, display: `${(calc.tirA * 100).toFixed(1)}% a.a.` },
                ].map((item, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "14px 16px", borderRadius: 12,
                    background: item.val ? "#F0FDF4" : "#FFF7ED",
                    border: `1px solid ${item.val ? "#BBF7D0" : "#FED7AA"}`
                  }}>
                    {item.val
                      ? <CheckCircle size={18} color="#16A34A" />
                      : <AlertCircle size={18} color="#EA580C" />}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: item.val ? "#15803D" : "#9A3412" }}>{item.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{item.display}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary Table */}
            <div style={{
              background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB",
              padding: "22px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)"
            }}>
              <div style={{ fontWeight: 700, color: "#111827", fontSize: 15, marginBottom: 16 }}>Resumo Financeiro</div>
              {[
                ["Receita Bruta", fmt(calc.receitaBruta), null],
                ["(−) Deduções (ISS + Comissão + Outros)", fmt(calc.receitaBruta - calc.receitaLiquida), "red"],
                ["Receita Líquida", fmt(calc.receitaLiquida), "blue"],
                ["(−) Custo Total do Empreendimento", fmt(calc.custoTotal), "red"],
                ["Lucro Bruto", fmt(calc.lucroBruto), "green"],
              ].map(([label, value, color], i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 0",
                  borderBottom: i < 4 ? "1px solid #F3F4F6" : "none",
                  borderTop: i === 4 ? "2px solid #E5E7EB" : "none",
                }}>
                  <span style={{ fontSize: 13, color: "#6B7280" }}>{label}</span>
                  <span style={{
                    fontSize: 14, fontWeight: i === 4 ? 800 : 600,
                    color: color === "red" ? "#EF4444" : color === "green" ? "#16A34A" : color === "blue" ? "#1d4ed8" : "#111827"
                  }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─────────────── CONFIGURAÇÃO ─────────────── */}
        {tab === "config" && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Parâmetros do Projeto</h2>
              <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>Altere os valores para simular diferentes cenários</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 20 }}>
              {/* Parâmetros Físicos */}
              <div style={{
                background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB",
                padding: "22px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                  <Building2 size={16} color="#1d4ed8" />
                  <span style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>Parâmetros Físicos</span>
                </div>
                {[
                  { key: "blocos", label: "Nº de Blocos", unit: "un", min: 1, max: 10, step: 1 },
                  { key: "pavimentos", label: "Pavimentos por Bloco", unit: "pav", min: 2, max: 10, step: 1 },
                  { key: "unidadesPav", label: "Unidades por Pavimento", unit: "un/pav", min: 2, max: 16, step: 1 },
                  { key: "areaPrivativa", label: "Área Privativa", unit: "m²", min: 30, max: 100, step: 0.5 },
                  { key: "prazo", label: "Prazo Total", unit: "meses", min: 8, max: 36, step: 1 },
                ].map(({ key, label, unit, min, max, step }) => (
                  <div key={key} style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "#6B7280" }}>{label}</label>
                      <span style={{
                        fontSize: 13, fontWeight: 700, color: "#111827",
                        background: "#F9FAFB", padding: "1px 10px", borderRadius: 8, border: "1px solid #E5E7EB"
                      }}>
                        {params[key]} {unit}
                      </span>
                    </div>
                    <input
                      type="range" min={min} max={max} step={step} value={params[key]}
                      onChange={e => update(key, e.target.value)}
                      style={{ width: "100%", accentColor: "#1d4ed8" }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#D1D5DB" }}>
                      <span>{min}</span><span>{max}</span>
                    </div>
                  </div>
                ))}
                <div style={{
                  marginTop: 4, padding: "12px 14px", background: "#EFF6FF",
                  borderRadius: 10, border: "1px solid #BFDBFE"
                }}>
                  <div style={{ fontSize: 11, color: "#6B7280" }}>Total de Unidades</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#1d4ed8" }}>{calc.totalUnidades} un</div>
                </div>
              </div>

              {/* Parâmetros Financeiros */}
              <div style={{
                background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB",
                padding: "22px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                  <DollarSign size={16} color="#16A34A" />
                  <span style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>Parâmetros Financeiros</span>
                </div>
                {[
                  { key: "valorUnidade", label: "Valor de Venda por Unidade", prefix: "R$", min: 100000, max: 250000, step: 1000 },
                  { key: "custoM2", label: "Custo do m² (CUB)", prefix: "R$/m²", min: 1200, max: 2500, step: 10 },
                  { key: "terreno", label: "Custo do Terreno", prefix: "R$", min: 0, max: 2000000, step: 10000 },
                  { key: "custosIndiretos", label: "Custos Indiretos", prefix: "R$", min: 0, max: 200000, step: 1000 },
                  { key: "tma", label: "Taxa Mín. de Atratividade", prefix: "% a.a.", min: 5, max: 25, step: 0.5 },
                ].map(({ key, label, prefix, min, max, step }) => (
                  <div key={key} style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "#6B7280" }}>{label}</label>
                      <span style={{
                        fontSize: 13, fontWeight: 700, color: "#111827",
                        background: "#F9FAFB", padding: "1px 10px", borderRadius: 8, border: "1px solid #E5E7EB"
                      }}>
                        {key === "valorUnidade" || key === "terreno" || key === "custosIndiretos"
                          ? fmt(params[key])
                          : `${params[key]} ${prefix}`}
                      </span>
                    </div>
                    <input
                      type="range" min={min} max={max} step={step} value={params[key]}
                      onChange={e => update(key, e.target.value)}
                      style={{ width: "100%", accentColor: "#16A34A" }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#D1D5DB" }}>
                      <span>{key === "valorUnidade" || key === "terreno" || key === "custosIndiretos" ? fmt(min) : min}</span>
                      <span>{key === "valorUnidade" || key === "terreno" || key === "custosIndiretos" ? fmt(max) : max}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Composição de Custos */}
              <div style={{
                background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB",
                padding: "22px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                  <Layers size={16} color="#7C3AED" />
                  <span style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>Composição de Custos</span>
                </div>
                {CONSTRUCTION_ITEMS.map((item, i) => {
                  const value = calc.subtotalConstrucao * item.pct;
                  const colors = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#06B6D4", "#84CC16", "#F97316", "#EC4899", "#6366F1", "#14B8A6"];
                  return (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: "#6B7280" }}>{item.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#111827" }}>{fmt(value)}</span>
                      </div>
                      <div style={{ height: 5, background: "#F3F4F6", borderRadius: 3 }}>
                        <div style={{
                          height: 5, borderRadius: 3, width: `${item.pct * 100}%`,
                          background: colors[i], transition: "width 0.3s"
                        }} />
                      </div>
                      <div style={{ fontSize: 10, color: "#D1D5DB", textAlign: "right" }}>{(item.pct * 100).toFixed(0)}%</div>
                    </div>
                  );
                })}
                <div style={{
                  marginTop: 8, padding: "10px 12px", background: "#FAF5FF",
                  borderRadius: 10, border: "1px solid #E9D5FF"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#7C3AED" }}>Subtotal Construção</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#7C3AED" }}>{fmt(calc.subtotalConstrucao)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>Custo Total c/ Terreno</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{fmt(calc.custoTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────── FLUXO DE CAIXA ─────────────── */}
        {tab === "fluxo" && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Cronograma & Fluxo de Caixa</h2>
              <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>16 meses · Construção meses 1–12 · Recebimento meses 14–17</p>
            </div>

            {/* Mini KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
              {[
                { label: "Exposição Máxima", value: fmt(Math.abs(calc.exposicaoMax)), color: "#EF4444", bg: "#FEF2F2" },
                { label: "Ponto de Equilíbrio", value: "Mês 16", color: "#1d4ed8", bg: "#EFF6FF" },
                { label: "Receita Líquida Total", value: fmt(calc.receitaLiquida), color: "#16A34A", bg: "#F0FDF4" },
              ].map((item, i) => (
                <div key={i} style={{
                  background: item.bg, borderRadius: 12, padding: "14px 18px",
                  border: `1px solid ${item.bg === "#FEF2F2" ? "#FECACA" : item.bg === "#EFF6FF" ? "#BFDBFE" : "#BBF7D0"}`
                }}>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Saldo Acumulado Chart */}
            <div style={{
              background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB",
              padding: "22px 24px", marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.05)"
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#111827", marginBottom: 16 }}>Saldo Acumulado (R$)</div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={cashFlowData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradPos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#16A34A" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#16A34A" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradNeg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                  <YAxis tickFormatter={v => `${(v / 1e6).toFixed(1)}M`} tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                  <Tooltip
                    formatter={(v) => [fmt(v), "Saldo Acumulado"]}
                    contentStyle={{ borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 12 }}
                  />
                  <ReferenceLine y={0} stroke="#E5E7EB" strokeWidth={2} />
                  <Area dataKey="acumulado" stroke="#1d4ed8" strokeWidth={2.5} fill="url(#gradPos)"
                    dot={false} activeDot={{ r: 5, fill: "#1d4ed8" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Monthly Bar Chart */}
            <div style={{
              background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB",
              padding: "22px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)"
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#111827", marginBottom: 16 }}>
                Desembolsos vs Receitas Mensais
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={cashFlowData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                  <YAxis tickFormatter={v => `${(v / 1e6).toFixed(1)}M`} tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                  <Tooltip
                    formatter={(v, name) => [fmt(Math.abs(v)), name === "custo" ? "Custo" : "Receita"]}
                    contentStyle={{ borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 12 }}
                  />
                  <Bar dataKey="custo" name="Custo" fill="#FCA5A5" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="receita" name="Receita" fill="#6EE7B7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", gap: 20, marginTop: 10, justifyContent: "center" }}>
                {[["#FCA5A5", "Desembolsos"], ["#6EE7B7", "Receitas"]].map(([c, l]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6B7280" }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
                    {l}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─────────────── SENSIBILIDADE ─────────────── */}
        {tab === "sensibilidade" && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Análise de Sensibilidade</h2>
              <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>Impacto de variações no custo total sobre os indicadores de retorno</p>
            </div>

            {/* Sensitivity Chart */}
            <div style={{
              background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB",
              padding: "22px 24px", marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.05)"
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#111827", marginBottom: 16 }}>ROI vs Variação de Custo</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={sensData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="variacao" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                  <YAxis tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                  <Tooltip
                    formatter={v => [`${v.toFixed(1)}%`, "ROI"]}
                    contentStyle={{ borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 12 }}
                  />
                  <ReferenceLine y={30} stroke="#FCD34D" strokeDasharray="4 4" label={{ value: "Min 30%", fontSize: 10, fill: "#B45309" }} />
                  <Bar dataKey="roi" name="ROI" radius={[5, 5, 0, 0]}>
                    {sensData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.isBase ? "#1d4ed8" : entry.roi >= 30 ? "#10B981" : "#EF4444"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Sensitivity Table */}
            <div style={{
              background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB",
              overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)"
            }}>
              <div style={{ padding: "18px 24px", borderBottom: "1px solid #F3F4F6" }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>Tabela Comparativa de Cenários</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#F9FAFB" }}>
                      {["Variação Custo", "Custo Total", "Lucro Bruto", "Margem", "ROI", "Status"].map(h => (
                        <th key={h} style={{
                          padding: "12px 16px", textAlign: "left",
                          fontSize: 11, fontWeight: 700, color: "#9CA3AF",
                          textTransform: "uppercase", letterSpacing: "0.5px",
                          borderBottom: "1px solid #E5E7EB"
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sensData.map((row, i) => {
                      const viable = row.roi >= 30 && row.lucro > 0;
                      return (
                        <tr key={i} style={{
                          background: row.isBase ? "#EFF6FF" : "transparent",
                          borderBottom: "1px solid #F3F4F6",
                        }}>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{
                              fontWeight: 700,
                              color: row.variacao.startsWith("-") ? "#16A34A" : row.variacao === "0%" ? "#1d4ed8" : "#EF4444",
                              fontSize: 13
                            }}>
                              {row.variacao}
                              {row.isBase && " (Base)"}
                            </span>
                          </td>
                          <td style={{ padding: "12px 16px", color: "#6B7280" }}>{fmt(row.custo)}</td>
                          <td style={{ padding: "12px 16px", fontWeight: 600, color: row.lucro > 0 ? "#16A34A" : "#EF4444" }}>
                            {fmt(row.lucro)}
                          </td>
                          <td style={{ padding: "12px 16px", color: "#6B7280" }}>{row.margem.toFixed(1)}%</td>
                          <td style={{ padding: "12px 16px", fontWeight: 700, color: row.roi >= 30 ? "#16A34A" : "#EF4444" }}>
                            {row.roi.toFixed(1)}%
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{
                              fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
                              background: viable ? "#DCFCE7" : "#FEE2E2",
                              color: viable ? "#166534" : "#991B1B"
                            }}>
                              {viable ? "✓ Viável" : "✗ Risco"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Insight Box */}
            <div style={{
              marginTop: 20, padding: "16px 20px", borderRadius: 14,
              background: "#FFFBEB", border: "1px solid #FDE68A",
              display: "flex", gap: 12, alignItems: "flex-start"
            }}>
              <AlertCircle size={18} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#92400E", marginBottom: 4 }}>Análise de Risco</div>
                <div style={{ fontSize: 12, color: "#78350F", lineHeight: 1.6 }}>
                  O projeto suporta até <strong>+15%</strong> de aumento nos custos mantendo ROI positivo.
                  Com os parâmetros atuais, o <strong>ponto de break-even de ROI (30%)</strong> ocorre em uma
                  variação de custo de aproximadamente +{(((calc.receitaLiquida - calc.custoTotal * 1.3) / (calc.custoTotal * 1.3)) < 0 ? "5-10" : "15-20")}%.
                  Monitore o CUB regional ({fmt(params.custoM2)}/m² atual) e os custos de terreno como principais variáveis de risco.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{
        marginTop: 60, borderTop: "1px solid #E5E7EB", padding: "20px 24px",
        textAlign: "center", fontSize: 11, color: "#D1D5DB"
      }}>
        Simulador MCMV · Alvenaria Estrutural 4 Pavimentos · Dados extraídos da planilha de viabilidade · 2026
      </footer>
    </div>
  );
}
