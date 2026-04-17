# Spec — Módulo Financeiro + Convênios

**Data:** 2026-04-17
**Status:** Aprovado
**Projeto:** Psicologo

---

## 1. Visão Geral

Este spec cobre dois conjuntos de mudanças relacionados:

1. **Módulo Financeiro** (`/financeiro`, `/financeiro/paciente/:id`) — atualmente stubs vazios. Torna-se um painel com abas: Resumo, Pacientes, Repasses e Despesas.
2. **Convênios** — novo conceito de plano de saúde. Pacientes passam a ter tipo `particular` ou `convenio`. Convênios são cadastrados no onboarding e influenciam o valor padrão das sessões.

---

## 2. Modelo de Dados — Mudanças

### Nova tabela: `convenios`

```sql
create table convenios (
  id           uuid primary key default uuid_generate_v4(),
  nome         text not null,          -- ex: "Unimed", "Bradesco Saúde"
  valor_sessao numeric(10,2),          -- valor que o convênio repassa por sessão (pode ser null se variável)
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now()
);

alter table convenios enable row level security;
create policy "auth users full access" on convenios
  for all to authenticated using (true) with check (true);
```

### Alterações em `pacientes`

```sql
alter table pacientes
  add column tipo       text not null default 'particular'
                        check (tipo in ('particular', 'convenio')),
  add column convenio_id uuid references convenios(id) on delete set null;
```

- `tipo = 'particular'`: pagamento direto, usa `contratos` normalmente.
- `tipo = 'convenio'`: plano de saúde paga pelo paciente; `convenio_id` deve ser preenchido. Contrato é opcional (pode não haver contrato se o convênio paga valor fixo via `convenios.valor_sessao`).

### Nova tabela: `despesas`

Despesas manuais mensais do consultório (aluguel, espaço de atendimento, etc.).

```sql
create table despesas (
  id          uuid primary key default uuid_generate_v4(),
  mes         date not null,           -- primeiro dia do mês. ex: '2026-04-01'
  descricao   text not null,
  valor       numeric(10,2) not null,
  criado_em   timestamptz not null default now()
);

alter table despesas enable row level security;
create policy "auth users full access" on despesas
  for all to authenticated using (true) with check (true);
```

---

## 3. TypeScript — Novos Tipos

Adicionar em `src/lib/types.ts`:

```typescript
export interface Convenio {
  id: string
  nome: string
  valor_sessao: number | null
  ativo: boolean
  criado_em: string
}

export interface Despesa {
  id: string
  mes: string          // 'YYYY-MM-DD' (primeiro dia do mês)
  descricao: string
  valor: number
  criado_em: string
}
```

Modificar `Paciente` — adicionar campos:

```typescript
export interface Paciente {
  // ... campos existentes ...
  tipo: 'particular' | 'convenio'
  convenio_id: string | null
}
```

---

## 4. Onboarding — Nova Etapa: Convênios

### Fluxo atualizado (4 etapas)

| Etapa | Rota | Conteúdo |
|---|---|---|
| 1 | `/onboarding` | Dados básicos (nome, horários, checklist) |
| 2 | `/onboarding?step=2` | Modalidades |
| **3 (nova)** | `/onboarding?step=3` | **Convênios** |
| 4 | `/onboarding?step=4` | WhatsApp (era etapa 3) |

### Etapa 3 — Convênios

Título: **"Você atende por algum convênio?"**
Subtítulo: "Cadastre os planos que você aceita. Você poderá adicionar ou editar depois em Configurações."

Interface:
- Lista de convênios já adicionados (inicialmente vazia), cada um com nome + valor de sessão + botão remover.
- Formulário inline: campo "Nome do plano" + campo "Valor por sessão (R$)" + botão "Adicionar".
- Botão "Não atendo por convênio" — pula a etapa sem salvar nada.
- Botão "Continuar" — salva os convênios e avança para etapa 4 (WhatsApp).

Nenhum convênio é obrigatório para concluir o onboarding.

---

## 5. Cadastro de Paciente — Mudanças

### Novo campo: Tipo de atendimento

Após o campo "Nome", adicionar seletor:

```
Tipo de atendimento
○ Particular
○ Convênio
```

Quando **Convênio** selecionado:
- Exibir dropdown "Plano de saúde" com os convênios cadastrados.
- Campo obrigatório — não pode salvar sem selecionar o plano.
- Seção de contrato fica opcional (exibir com aviso: "Pacientes de convênio geralmente não precisam de contrato — o valor é definido pelo plano.").

Quando **Particular** selecionado:
- Comportamento atual mantido (contrato obrigatório).

### Valor padrão na criação de sessão

A `NovaSessaoModal` foi modificada na fase anterior para ocultar o campo de valor em pacientes cadastrados (assume que o contrato define o valor). Com convênios, o comportamento muda:

- **Paciente particular:** campo de valor oculto (mantém comportamento atual).
- **Paciente convênio:** campo de valor exibido, pré-preenchido com `convenio.valor_sessao` (se não for null), editável.

Para implementar: `NovaSessaoModal` deve receber o paciente selecionado (já tem `paciente_id`), buscar `tipo` e `convenio.valor_sessao` via join ou lookup, e condicionar a exibição do campo.

---

## 6. Módulo Financeiro — `/financeiro`

### Estrutura geral

Cabeçalho com título "Financeiro", subtítulo com mês atual e navegação ◀ ▶ entre meses.

Quatro abas: **Resumo · Pacientes · Repasses · Despesas**

---

### 6.1 Aba Resumo

**4 cards KPI (grid 2×2):**

| Card | Valor | Detalhe |
|---|---|---|
| Recebido | Soma de `valor_cobrado` onde `pago = true` no mês | "N sessões pagas" |
| Pendente | Soma de `valor_cobrado` onde `pago = false` e `status = 'concluida'` no mês | "N sessões em aberto" |
| Projeção | Recebido + Pendente + valor das sessões `agendada`/`confirmada` restantes no mês | "baseada em agendadas" |
| Resultado líquido | Recebido − total de repasses pagos no mês − total de despesas do mês | "após repasses e despesas" |

**Gráfico de barras empilhadas — Sessões por semana:**
- Eixo X: semanas do mês (S1, S2, S3, S4).
- Barras empilhadas: `concluida` (verde) + `faltou` (âmbar) + `cancelada` (vermelho).
- Semanas futuras exibidas com barra tracejada (sessões agendadas/confirmadas).
- Implementado com `Recharts` usando `<ResponsiveContainer width="100%" height={120}>`.

**Bloco "Saídas do mês":**
Lista simples com 2 linhas:
- Repasses: soma dos `repasses` com `pago = true` no mês (calculado a partir da tabela `repasses`).
- Despesas: soma das `despesas` do mês.
- Total: Resultado líquido.

---

### 6.2 Aba Pacientes

Lista de todos os pacientes com sessões no mês, ordenada por total recebido (decrescente).

Cada linha:
- Nome do paciente
- Badge `Convênio` em roxo claro se `tipo = 'convenio'` (com nome do plano)
- Data da última sessão no mês
- Número de sessões no mês
- Total recebido no mês (verde) + pendente se houver (âmbar)

Toque/clique → navega para `/financeiro/paciente/:id`.

---

### 6.3 Aba Repasses

Lista uma entrada por regra de repasse ativa (`regras_repasse`).

Para cada regra:
- Nome e tipo (percentual ou fixo)
- Cálculo do mês: se percentual, aplica sobre soma de `valor_cobrado` das sessões `pago = true` do mês; se fixo, usa `regra.valor` diretamente.
- Status: "A pagar" (âmbar) ou "Pago em DD/MM" (verde).
- Botão "Marcar como pago" quando ainda não pago → upsert em `repasses` com `pago = true`, `data_pagamento = hoje`, `valor_calculado = valor do mês`.

**Lógica de persistência:** a tabela `repasses` existente tem `sessao_id` por sessão, mas para controle mensal de pagamento precisamos de um registro por (regra, mês). A migration `005_convenios.sql` deve também:
```sql
alter table repasses
  add column if not exists mes date,        -- ex: '2026-04-01'
  alter column sessao_id drop not null;     -- null quando for registro mensal agregado
```
Upsert usa constraint única em (`regra_repasse_id`, `mes`) — adicionar index único nessa combinação quando `mes IS NOT NULL`.

---

### 6.4 Aba Despesas

Lista de despesas do mês (da tabela `despesas` onde `mes = primeiro dia do mês selecionado`).

Cada entrada:
- Descrição
- Valor em vermelho
- Botão remover (×) → deleta o registro

Formulário inline ao final da lista:
- Campo "Descrição" (texto livre)
- Campo "Valor (R$)" (numérico)
- Botão "+ Adicionar" → insere em `despesas`

Total do mês exibido abaixo da lista.

---

## 7. Detalhe Financeiro por Paciente — `/financeiro/paciente/:id`

Cabeçalho:
- Nome do paciente, tipo (badge Particular / badge Convênio + nome do plano)
- Navegação ◀ ▶ de mês (mesmo padrão do `/financeiro`)

**Cards KPI (linha horizontal):**
- Total histórico pago
- Total pendente (concluídas não pagas — todos os meses)
- Número de sessões no mês selecionado

**Lista de sessões do mês selecionado:**
Cada item: data/hora + modalidade + status (cor) + valor + badge "Pago" ou "Pendente"

Ordenada por `data_hora` decrescente.

---

## 8. Configurações — Gerenciar Convênios

Em `/configuracoes`, adicionar seção "Convênios" (similar à seção de Modalidades existente):
- Lista de convênios cadastrados com nome, valor de sessão e toggle ativo/inativo.
- Formulário para adicionar novo convênio.
- Edição inline do valor de sessão.

---

## 9. Hooks Necessários

| Hook | Arquivo | Responsabilidade |
|---|---|---|
| `useFinanceiro` | `src/hooks/useFinanceiro.ts` | KPIs + sessões do mês + semanas para gráfico |
| `useRepasses` | `src/hooks/useRepasses.ts` | Regras + cálculo + upsert "marcar como pago" |
| `useDespesas` | `src/hooks/useDespesas.ts` | CRUD de despesas do mês |
| `useConvenios` | `src/hooks/useConvenios.ts` | Lista de convênios ativos (usado no cadastro e onboarding) |
| `useFinanceiroPaciente` | `src/hooks/useFinanceiroPaciente.ts` | Histórico + sessões por mês de um paciente |

---

## 10. Migrações

Duas novas migrações (aplicar em ordem):

1. `supabase/migrations/005_convenios.sql` — tabela `convenios` + colunas em `pacientes`
2. `supabase/migrations/006_despesas.sql` — tabela `despesas`

---

## 11. Fora de Escopo (neste plano)

- Emissão de nota fiscal ou recibo
- Relatórios exportáveis (PDF/CSV)
- Integração com sistemas de convênio (TISS, SADT)
- Histórico de alteração de valores de convênio
- Múltiplos convênios por paciente
