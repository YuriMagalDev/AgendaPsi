# Psicologo — Plataforma de Gestão para Psicólogos

## O que é este projeto

Aplicativo web para um psicólogo gerir agendamentos, confirmações de sessões e financeiro em um único lugar. Pensado para uso pessoal (um único usuário). Construído para web hoje, com migração para mobile via Capacitor no futuro.

O spec completo de design está em: `docs/superpowers/specs/2026-04-14-psicologo-design.md`

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React + Vite + TypeScript + TailwindCSS |
| Mobile (futuro) | Capacitor |
| Backend / DB | Supabase (PostgreSQL + Auth + Realtime + Edge Functions) |
| Automação WhatsApp | Evolution API (self-hosted em VPS próprio) |

---

## Módulos principais

1. **Autenticação** — login email/senha via Supabase Auth
2. **Pacientes** — cadastro focado em agendamento e cobrança (sem prontuário clínico)
3. **Agenda** — duas visões: Kanban por status e Agenda por dia
4. **Atendimentos Avulsos** — sessões sem paciente cadastrado, convertíveis em paciente
5. **Checklist Fim de Dia** — atualização em lote do status das sessões do dia
6. **WhatsApp (opcional)** — lembretes D-1 com botão sim/não via Evolution API
7. **Financeiro** — receita mensal, por paciente, repasses, inadimplência e projeção
8. **Configurações** — modalidades, horários, conexão WhatsApp

---

## Decisões de arquitetura

- Frontend fala diretamente com Supabase via `supabase-js` para todo CRUD
- Evolution API é acessada exclusivamente via Edge Functions (credenciais nunca no frontend)
- Ao criar conta, Edge Function provisiona automaticamente uma instância Evolution API — o psicólogo só escaneia o QR Code
- Supabase Realtime mantém o Kanban atualizado em tempo real quando chega confirmação via WhatsApp
- Automação WhatsApp é **opcional** — app funciona completamente sem ela

---

## Modelo de dados (resumo)

- `pacientes` — cadastro básico (nome, telefone, email, data de nascimento)
- `modalidades` — personalizáveis (Presencial, Online + customizadas)
- `contratos` — forma de cobrança por paciente: por sessão, pacote ou mensal
- `sessoes` — cada atendimento; suporta paciente cadastrado ou avulso; status: agendada / confirmada / concluida / faltou / cancelada / remarcada
- `regras_repasse` — regras globais de repasse (ex: "20% para clínica"); fixo ou percentual
- `repasses` — registros gerados por sessão a partir das regras; rastreia se foi pago
- `confirmacoes_whatsapp` — log dos lembretes enviados e respostas recebidas
- `config_psicologo` — configurações globais da conta

---

## Rotas do app

```
/login
/onboarding

/agenda           (padrão)
/kanban
/checklist

/pacientes
/pacientes/novo
/pacientes/:id

/financeiro
/financeiro/paciente/:id

/configuracoes
```

---

## Fora do escopo

- Prontuário clínico (anotações de sessão, diagnósticos, medicações)
- Multi-usuário / multi-clínica / SaaS
- Portal do paciente (paciente não acessa o app)
- Integração com convênios

---

## Design System

### Conceito
*"Consultório digital"* — quente, organizado, humano. Estética de consultório bem cuidado: sem frieza clínica, sem excesso de cor corporativa.

### Paleta de cores (CSS variables)
```css
--bg:            #F7F5F2   /* fundo geral — off-white quente */
--surface:       #FFFFFF   /* cards, modais, painéis */
--primary:       #2D6A6A   /* teal escuro — botões, ícones ativos */
--primary-light: #E8F4F4   /* badges, highlights */
--accent:        #C17F59   /* âmbar terroso — alertas, status faltou */
--text:          #1C1C1C   /* texto principal */
--muted:         #7A7A7A   /* texto secundário, labels */
--border:        #E4E0DA   /* bordas, divisores */
```

### Status das sessões (cores dos cards Kanban)
| Status | Cor da borda esquerda |
|---|---|
| `agendada` | cinza `#9CA3AF` |
| `confirmada` | teal `#2D6A6A` |
| `concluida` | verde `#4CAF82` |
| `faltou` | âmbar `#C17F59` |
| `cancelada` | vermelho suave `#E07070` |
| `remarcada` | roxo suave `#9B7EC8` |

### Tipografia
- **Display / headings:** Fraunces (serif com personalidade, transmite confiança)
- **Corpo / UI:** DM Sans (humanista, legível, moderna)
- **Números financeiros / código:** DM Mono

### Componentes base
- Cards: `border-radius: 12px`, sombra sutil, indicador de status na borda esquerda
- Bottom navigation (mobile): ícones + label, tab ativa com pill indicator
- Formulários: labels acima do campo, sem placeholders como substituto de label

### Bibliotecas de UI
1. **shadcn/ui** — base: Dialog, Select, Calendar, Table, Toast, Drawer
2. **21st.dev** — cards de dashboard, Kanban, componentes de seções
3. **Recharts** — gráficos do módulo financeiro

---

## Convenções de desenvolvimento

- TypeScript estrito em todo o projeto
- Componentes React funcionais com hooks
- Supabase como única fonte de verdade — sem estado global complexo (Zustand/Redux)
- Edge Functions em TypeScript (Deno runtime do Supabase)
- TailwindCSS para estilos — sem CSS modules ou styled-components
- Nomes de arquivos: kebab-case para componentes e páginas
- Variáveis de ambiente: nunca commitar `.env` — usar `.env.example` como referência
