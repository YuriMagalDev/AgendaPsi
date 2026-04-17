// src/pages/FinanceiroPage.tsx
import { useState } from 'react'
import { addMonths, subMonths, startOfMonth, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { Trash2, Plus } from 'lucide-react'
import { useFinanceiro } from '@/hooks/useFinanceiro'
import { useRepasses } from '@/hooks/useRepasses'
import { useDespesas } from '@/hooks/useDespesas'
import { useNavigate } from 'react-router-dom'

type Aba = 'resumo' | 'pacientes' | 'repasses' | 'despesas'

const inputClass = "h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function FinanceiroPage() {
  const navigate = useNavigate()
  const [mes, setMes] = useState(() => startOfMonth(new Date()))
  const [aba, setAba] = useState<Aba>('resumo')
  const [novaDescricao, setNovaDescricao] = useState('')
  const [novoValor, setNovoValor] = useState('')

  const { dados, loading } = useFinanceiro(mes)
  const { itens: repasses, loading: loadingRepasses, totalPago, totalAPagar, marcarComoPago } = useRepasses(mes, dados.recebido)
  const { despesas, loading: loadingDespesas, total: totalDespesas, addDespesa, removeDespesa } = useDespesas(mes)

  const resultadoLiquido = dados.recebido - totalPago - totalDespesas
  const tituloMes = format(mes, "MMMM 'de' yyyy", { locale: ptBR })

  const abas: { key: Aba; label: string }[] = [
    { key: 'resumo', label: 'Resumo' },
    { key: 'pacientes', label: 'Pacientes' },
    { key: 'repasses', label: 'Repasses' },
    { key: 'despesas', label: 'Despesas' },
  ]

  async function handleAddDespesa() {
    if (!novaDescricao.trim() || !novoValor) return
    await addDespesa(novaDescricao.trim(), Number(novoValor))
    setNovaDescricao('')
    setNovoValor('')
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Financeiro</h1>
          <p className="text-sm text-muted capitalize">{tituloMes}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMes(m => startOfMonth(subMonths(m, 1)))}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted hover:text-[#1C1C1C] transition-colors"
          >
            ◀
          </button>
          <button
            onClick={() => setMes(m => startOfMonth(addMonths(m, 1)))}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted hover:text-[#1C1C1C] transition-colors"
          >
            ▶
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {abas.map(a => (
          <button
            key={a.key}
            onClick={() => setAba(a.key)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
              aba === a.key
                ? 'bg-primary text-white'
                : 'bg-surface border border-border text-muted hover:text-[#1C1C1C]'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* ABA: Resumo */}
      {aba === 'resumo' && (
        <div className="flex flex-col gap-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* KPI grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Recebido', valor: dados.recebido, cor: '#4CAF82', detalhe: `${dados.totalSessoes} sessões no mês` },
                  { label: 'Pendente', valor: dados.pendente, cor: '#C17F59', detalhe: `${dados.pacientes.filter(p => p.pendente > 0).length} pacientes` },
                  { label: 'Projeção', valor: dados.projecao, cor: '#9B7EC8', detalhe: 'baseada em agendadas' },
                  { label: 'Resultado líquido', valor: resultadoLiquido, cor: '#2D6A6A', detalhe: 'após repasses e despesas' },
                ].map(k => (
                  <div key={k.label} className="bg-surface rounded-card border border-border p-4"
                    style={{ borderLeftWidth: 3, borderLeftColor: k.cor }}>
                    <p className="text-xs text-muted uppercase tracking-wide mb-1">{k.label}</p>
                    <p className="text-xl font-semibold font-mono text-[#1C1C1C]">{moeda(k.valor)}</p>
                    <p className="text-xs text-muted mt-0.5">{k.detalhe}</p>
                  </div>
                ))}
              </div>

              {/* Stacked bar chart */}
              <div className="bg-surface rounded-card border border-border p-4">
                <p className="text-xs text-muted uppercase tracking-wide mb-3">Sessões por semana</p>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={dados.semanas} barSize={32} barCategoryGap="30%">
                    <XAxis dataKey="label" tickLine={false} axisLine={false}
                      tick={{ fontSize: 11, fill: '#7A7A7A' }} />
                    <Tooltip
                      formatter={(value, name) => {
                        const labels: Record<string, string> = {
                          concluida: 'Concluída', faltou: 'Faltou',
                          cancelada: 'Cancelada', agendada: 'Agendada',
                        }
                        return [value, labels[name as string] ?? name]
                      }}
                    />
                    <Bar dataKey="concluida" stackId="a" fill="#4CAF82" />
                    <Bar dataKey="faltou" stackId="a" fill="#C17F59" />
                    <Bar dataKey="cancelada" stackId="a" fill="#E07070" />
                    <Bar dataKey="agendada" stackId="a" fill="#E8F4F4"
                      stroke="#4CAF82" strokeDasharray="3 2" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-1 flex-wrap">
                  {[
                    { cor: '#4CAF82', label: 'Concluída' },
                    { cor: '#C17F59', label: 'Faltou' },
                    { cor: '#E07070', label: 'Cancelada' },
                    { cor: '#E8F4F4', label: 'Agendada', dashed: true },
                  ].map(l => (
                    <span key={l.label} className="flex items-center gap-1.5 text-xs text-muted">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm"
                        style={{ background: l.cor, border: l.dashed ? '1px dashed #4CAF82' : undefined }} />
                      {l.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Saídas do mês */}
              <div className="bg-surface rounded-card border border-border p-4">
                <p className="text-xs text-muted uppercase tracking-wide mb-3">Saídas do mês</p>
                <div className="flex justify-between text-sm py-2 border-b border-border">
                  <span className="text-muted">Repasses</span>
                  <span className="font-mono text-[#E07070]">− {moeda(totalPago)}</span>
                </div>
                <div className="flex justify-between text-sm py-2 border-b border-border">
                  <span className="text-muted">Despesas</span>
                  <span className="font-mono text-[#E07070]">− {moeda(totalDespesas)}</span>
                </div>
                <div className="flex justify-between text-sm pt-3 font-semibold">
                  <span>Resultado líquido</span>
                  <span className="font-mono text-[#2D6A6A]">{moeda(resultadoLiquido)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ABA: Pacientes */}
      {aba === 'pacientes' && (
        <div>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : dados.pacientes.length === 0 ? (
            <p className="text-center py-12 text-sm text-muted">Nenhuma sessão neste mês.</p>
          ) : (
            <div className="bg-surface rounded-card border border-border overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-2 border-b border-border text-xs text-muted uppercase tracking-wide">
                <span>Paciente</span>
                <span className="text-right">Sessões</span>
                <span className="text-right">Total</span>
              </div>
              {dados.pacientes.map((p, i) => (
                <button
                  key={i}
                  onClick={() => p.paciente_id && navigate(`/financeiro/paciente/${p.paciente_id}`)}
                  className="w-full grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-3 border-b border-border last:border-0 text-left hover:bg-bg transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-[#1C1C1C] leading-tight">{p.nome}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {p.tipo === 'convenio' && p.convenio_nome && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-[#9B7EC8]/10 text-[#9B7EC8]">
                          {p.convenio_nome}
                        </span>
                      )}
                      {p.ultima_sessao && (
                        <span className="text-xs text-muted">
                          Última: {format(new Date(p.ultima_sessao), 'dd/MM', { locale: ptBR })}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted text-right pt-1">{p.sessoes}</span>
                  <div className="text-right">
                    <span className="text-sm font-mono font-medium text-[#4CAF82]">{moeda(p.recebido)}</span>
                    {p.pendente > 0 && (
                      <p className="text-xs text-[#C17F59]">+ {moeda(p.pendente)} pend.</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ABA: Repasses */}
      {aba === 'repasses' && (
        <div className="flex flex-col gap-3">
          {loadingRepasses ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : repasses.length === 0 ? (
            <p className="text-center py-12 text-sm text-muted">
              Nenhuma regra de repasse configurada.
            </p>
          ) : (
            <>
              {repasses.map(r => (
                <div key={r.regra_id} className="bg-surface rounded-card border border-border p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="text-sm font-medium text-[#1C1C1C]">{r.nome}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {r.tipo_valor === 'percentual' ? 'Percentual sobre recebido' : 'Valor fixo mensal'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold font-mono">{moeda(r.valorCalculado)}</p>
                      {r.pago ? (
                        <p className="text-xs text-[#4CAF82] mt-0.5">
                          ● Pago em {r.data_pagamento ? format(new Date(r.data_pagamento), 'dd/MM') : '—'}
                        </p>
                      ) : (
                        <p className="text-xs text-[#C17F59] mt-0.5">● A pagar</p>
                      )}
                    </div>
                  </div>
                  {r.pago ? (
                    <div className="w-full py-2 rounded-lg bg-[#F0FAF5] text-[#4CAF82] text-xs font-medium text-center">
                      ✓ Pago
                    </div>
                  ) : (
                    <button
                      onClick={() => marcarComoPago(r.regra_id, r.valorCalculado)}
                      className="w-full py-2 rounded-lg border border-primary text-primary text-xs font-medium hover:bg-primary/5 transition-colors"
                    >
                      Marcar como pago
                    </button>
                  )}
                </div>
              ))}
              <div className="bg-[#E8F4F4] rounded-lg p-3 text-xs text-[#2D6A6A]">
                <span className="font-semibold">Total a pagar:</span> {moeda(totalAPagar)}
                {' '}·{' '}
                <span className="font-semibold">Já pago:</span> {moeda(totalPago)}
              </div>
            </>
          )}
        </div>
      )}

      {/* ABA: Despesas */}
      {aba === 'despesas' && (
        <div className="flex flex-col gap-3">
          {loadingDespesas ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {despesas.length > 0 && (
                <div className="bg-surface rounded-card border border-border overflow-hidden">
                  {despesas.map(d => (
                    <div key={d.id} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0">
                      <span className="text-sm text-[#1C1C1C]">{d.descricao}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono font-medium text-[#E07070]">{moeda(d.valor)}</span>
                        <button
                          onClick={() => removeDespesa(d.id)}
                          className="text-muted hover:text-[#E07070] transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add form */}
              <div className="bg-surface rounded-card border border-border p-4">
                <p className="text-xs text-muted uppercase tracking-wide mb-3">Adicionar despesa</p>
                <div className="flex gap-2">
                  <input
                    placeholder="Descrição (ex: aluguel)"
                    value={novaDescricao}
                    onChange={e => setNovaDescricao(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddDespesa()}
                    className={`${inputClass} flex-1`}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="R$"
                    value={novoValor}
                    onChange={e => setNovoValor(e.target.value)}
                    className={`${inputClass} w-24`}
                  />
                  <button
                    onClick={handleAddDespesa}
                    disabled={!novaDescricao.trim() || !novoValor}
                    className="h-9 px-3 rounded-lg bg-primary text-white disabled:opacity-40 transition-colors hover:bg-primary/90"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {despesas.length > 0 && (
                <div className="bg-surface rounded-card border border-border p-3 flex justify-between text-sm font-semibold">
                  <span>Total de despesas</span>
                  <span className="font-mono text-[#E07070]">{moeda(totalDespesas)}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
