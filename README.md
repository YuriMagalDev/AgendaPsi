<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" />
  <img src="https://img.shields.io/badge/TailwindCSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" />
</p>

# 🧠 AgendaPsi

**Plataforma de gestão para psicólogos** — agendamentos, confirmações de sessão e controle financeiro em um único lugar.

> *"Consultório digital"* — quente, organizado, humano. Sem frieza clínica, sem excesso de cor corporativa.

---

## 📋 Sobre o Projeto

AgendaPsi é um aplicativo web projetado para psicólogos que precisam gerenciar sua rotina de atendimentos de forma simples e eficiente. A plataforma unifica agenda, pacientes, sessões e financeiro, eliminando a necessidade de planilhas e apps separados.

Construído para uso pessoal (single-user), com arquitetura preparada para migração mobile via **Capacitor** no futuro.

---

## ✨ Funcionalidades

| Módulo | Descrição |
|--------|-----------|
| 🔐 **Autenticação** | Login seguro via email/senha com Supabase Auth |
| 👤 **Pacientes** | Cadastro focado em agendamento e cobrança (sem prontuário clínico) |
| 📅 **Agenda** | Visualização diária dos atendimentos |
| 📊 **Kanban** | Visão por status das sessões com atualização em tempo real |
| ✅ **Checklist** | Atualização em lote do status das sessões ao fim do dia |
| 💰 **Financeiro** | Receita mensal, por paciente, repasses, inadimplência e projeção |
| 💬 **WhatsApp** | Lembretes automáticos D-1 com confirmação sim/não via Evolution API |
| ⚙️ **Configurações** | Modalidades, horários e conexão WhatsApp |

---

## 🏗️ Stack Tecnológica

| Camada | Tecnologia |
|--------|------------|
| **Frontend** | React 19 · Vite 6 · TypeScript 5.8 · Tailwind CSS 4 |
| **UI Components** | shadcn/ui · Lucide Icons · Recharts · Sonner · Vaul |
| **Forms** | React Hook Form · Zod |
| **Backend / DB** | Supabase (PostgreSQL + Auth + Realtime + Edge Functions) |
| **WhatsApp** | Evolution API (self-hosted) |
| **Mobile (futuro)** | Capacitor |

---

## 🗃️ Modelo de Dados

```
modalidades          — Presencial, Online + customizadas
pacientes            — cadastro básico (nome, telefone, email, nascimento)
contratos            — forma de cobrança: por sessão, pacote ou mensal
sessoes              — cada atendimento; suporta paciente ou avulso
regras_repasse       — regras globais de repasse (ex: "20% para clínica")
repasses             — registros por sessão gerados a partir das regras
confirmacoes_whatsapp — log de lembretes enviados e respostas
config_psicologo     — configurações globais da conta
```

### Status das Sessões

| Status | Descrição |
|--------|-----------|
| 🔘 `agendada` | Sessão criada, aguardando confirmação |
| 🟢 `confirmada` | Paciente confirmou presença |
| ✅ `concluida` | Sessão realizada com sucesso |
| 🟠 `faltou` | Paciente não compareceu |
| 🔴 `cancelada` | Sessão cancelada |
| 🟣 `remarcada` | Sessão remarcada para outra data |

---

## 🚀 Como Rodar

### Pré-requisitos

- [Node.js](https://nodejs.org/) 18+
- [npm](https://www.npmjs.com/) 9+
- Conta no [Supabase](https://supabase.com/) (gratuita)

### Instalação

```bash
# 1. Clone o repositório
git clone https://github.com/YuriMagalDev/AgendaPsi.git
cd AgendaPsi

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais do Supabase
```

### Variáveis de Ambiente

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Configuração do Supabase

1. Crie um projeto no [Supabase Dashboard](https://app.supabase.com/)
2. Execute a migration inicial no SQL Editor:
   - Copie o conteúdo de `supabase/migrations/001_initial_schema.sql`
   - Cole e execute no SQL Editor do Supabase
3. Copie a **URL** e a **anon key** do projeto para o arquivo `.env`

### Rodando o projeto

```bash
# Modo desenvolvimento
npm run dev

# Build de produção
npm run build

# Preview do build
npm run preview
```

### Testes

```bash
# Rodar testes em modo watch
npm test

# Rodar testes uma vez
npm run test:run

# Testes com cobertura
npm run test:coverage
```

---

## 📁 Estrutura do Projeto

```
AgendaPsi/
├── public/                    # Assets estáticos
├── src/
│   ├── components/
│   │   ├── layout/            # AppLayout, Sidebar, BottomNav
│   │   └── ui/                # Componentes reutilizáveis (shadcn/ui)
│   ├── contexts/              # AuthContext (Supabase Auth)
│   ├── hooks/                 # useAuth e hooks customizados
│   ├── lib/
│   │   ├── supabase.ts        # Cliente Supabase
│   │   ├── types.ts           # Interfaces TypeScript
│   │   └── utils.ts           # Funções utilitárias
│   ├── pages/                 # Páginas da aplicação
│   ├── test/                  # Configuração de testes
│   ├── router.tsx             # Definição de rotas
│   ├── App.tsx                # Componente raiz
│   ├── main.tsx               # Entry point
│   └── index.css              # Estilos globais + design tokens
├── supabase/
│   └── migrations/            # SQL migrations (schema do banco)
├── docs/
│   └── superpowers/           # Specs e planos do projeto
├── .env.example               # Exemplo de variáveis de ambiente
├── package.json
├── tailwind.config.ts
├── vite.config.ts
└── tsconfig.json
```

---

## 🛤️ Rotas

```
/login              → Tela de login
/onboarding         → Wizard de configuração inicial (3 etapas)

/agenda             → Visão diária da agenda (padrão)
/kanban             → Visão Kanban por status
/checklist          → Checklist de fim de dia

/pacientes          → Lista de pacientes
/pacientes/novo     → Cadastrar novo paciente
/pacientes/:id      → Detalhe do paciente

/financeiro         → Dashboard financeiro
/financeiro/paciente/:id → Financeiro por paciente

/configuracoes      → Configurações do app
```

---

## 🎨 Design System

### Paleta de Cores

| Token | Cor | Uso |
|-------|-----|-----|
| `--bg` | `#F7F5F2` | Fundo geral (off-white quente) |
| `--surface` | `#FFFFFF` | Cards, modais, painéis |
| `--primary` | `#2D6A6A` | Botões, ícones ativos (teal escuro) |
| `--primary-light` | `#E8F4F4` | Badges, highlights |
| `--accent` | `#C17F59` | Alertas, status "faltou" (âmbar terroso) |
| `--text` | `#1C1C1C` | Texto principal |
| `--muted` | `#7A7A7A` | Texto secundário, labels |
| `--border` | `#E4E0DA` | Bordas, divisores |

### Tipografia

- **Headings:** Fraunces (serif com personalidade)
- **UI / Corpo:** DM Sans (humanista, legível)
- **Números:** DM Mono (financeiro, código)

---

## 🏛️ Decisões de Arquitetura

- Frontend comunica diretamente com Supabase via `supabase-js` para CRUD
- Evolution API acessada exclusivamente via Edge Functions (credenciais nunca no frontend)
- Supabase Realtime mantém o Kanban atualizado quando chega confirmação via WhatsApp
- **WhatsApp é opcional** — o app funciona completamente sem ele
- Row Level Security (RLS) habilitada em todas as tabelas
- Single-user: sem multi-tenancy

---

## 🚧 Fora do Escopo

- ❌ Prontuário clínico (anotações, diagnósticos, medicações)
- ❌ Multi-usuário / multi-clínica / SaaS
- ❌ Portal do paciente
- ❌ Integração com convênios

---

## 📄 Licença

Este projeto é privado e de uso pessoal.

---

<p align="center">
  Feito com 💚 para psicólogos
</p>
