---
name: Beta launch plan — 10-person test batch
description: Checklist completo para lançar o beta com ~10 usuários reais; Stripe pulado por ora
type: project
originSessionId: c5ad1509-fe42-46e6-84ad-710490afd218
---
Objetivo: colocar ~10 psicólogos reais no app, coletar feedback, sem Stripe. Trials de 14 dias; extensão manual via Supabase Table Editor.

**Why:** Validar produto antes de adicionar complexidade de pagamento.

---

## BLOCO 1 — Pré-requisito: banco em produção isolado

> **Crítico: Plan 1 (multi-tenant) DEVE rodar antes do primeiro usuário real. Sem isso, usuários veem dados uns dos outros.**

- [x] ~~Executar `docs/superpowers/plans/2026-04-27-multi-tenant.md` em produção~~ — **CÓDIGO PRONTO** (migration 017: `set_user_id()` em 20+ tabelas, RLS tenant_isolation, `handle_new_user()`)
  - [x] RLS em todas as tabelas, user_id columns, signup trigger — migration 017 cobre tudo
  - [x] Migration 021 também precisa do `set_user_id()` trigger — **já incluso** no 017 (risco_config, risco_templates, risco_followups)
  - [x] RPC `get_pacientes_em_risco` — restaurar filtro `WHERE p.user_id = p_user_id` — **feito** no 017 line 331
- [x] ~~Executar `docs/superpowers/plans/2026-04-27-subscriptions.md`~~ — **CÓDIGO PRONTO** (migration 018: tabela `assinaturas`, hook `useAssinatura` + test)
- [x] ~~Executar `docs/superpowers/plans/2026-04-27-feature-gating.md`~~ — **CÓDIGO PRONTO** (`PlanoPage.tsx` + test, gating no AppLayout/BottomNav)
- [x] ~~Verificar que todos os Edge Functions estão deployados~~ — **12 funções ACTIVE em prod** (verificado 2026-05-07)

> ✅ **Bloco 1 completo em 2026-05-07** — Migrations 017–021 aplicadas + 12 Edge Functions ACTIVE

---

## BLOCO 2 — Testes passando

- [x] ~~Corrigir mocks em `src/hooks/__tests__/useRiscoConfig.test.ts`~~ — **concluído e commitado** (2026-05-07)
- [x] ~~Corrigir mocks em `src/hooks/__tests__/useRiscoTemplates.test.ts`~~ — **concluído e commitado** (2026-05-07)
- [x] ~~Revisar `src/components/pacientes/SendFollowupModal.tsx` e `supabase/migrations/021_pacientes_em_risco.sql`~~ — **commitados** (2026-05-07)
- [x] ~~Rodar `npm test` — zero falhas~~ — **157 testes passando** (2026-05-07)

---

## BLOCO 3 — Hospedagem

- [ ] Deploy do Vite app (opções em ordem de facilidade): **Vercel** > Netlify > Cloudflare Pages
  - Setar variáveis de ambiente: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  - Configurar redirect para `index.html` (SPA routing)
- [ ] Confirmar que URL de produção do Supabase está configurada em Authentication → URL Configuration (Site URL + Redirect URLs)
- [ ] Testar signup → login → onboarding completo na URL pública antes de convidar ninguém

---

## BLOCO 4 — Autenticação e onboarding

- [ ] **Redesign signup page** — rota `/signup` separada, bonita, com mais campos — **NÃO EXISTE (nenhum SignupPage.tsx)**
  - Usar skill `frontend-design` para qualidade alta
  - Coletar: nome, especialidade, telefone (no mínimo)
  - Validação client-side antes de criar conta
- [x] ~~Confirmar que `OnboardingPage.tsx` guia o usuário a configurar modalidades + horários~~ — **EXISTE** com 4 steps (StepDados, StepAtendimento, StepConvenios, StepWhatsapp)
- [ ] Email de confirmação do Supabase: personalizar template com nome do app (Supabase Dashboard → Authentication → Email Templates)

---

## BLOCO 5 — WhatsApp por usuário

O app provisiona uma instância Evolution por usuário no signup. Para o beta isso precisa estar funcionável:

- [x] ~~Confirmar que `whatsapp-setup` Edge Function cria instância Evolution para cada `user_id` único~~ — **CÓDIGO EXISTE** (`supabase/functions/whatsapp-setup/index.ts`)
- [ ] Confirmar que a VPS do Evolution suporta 10+ instâncias simultâneas (memória/CPU)
- [ ] Testar fluxo completo: signup → Configurações → QR Code aparece → scan → status vira "open"
- [ ] Documentar para os beta users: WhatsApp é opcional; app funciona sem ele
- [ ] Ter plano de fallback se instância travar: instrução para o user desconectar e reconectar pelo app

---

## BLOCO 6 — Landing page

- [ ] Receber design Canva do Yuri
- [ ] Conectar botões CTA da landing page à rota `/signup` do app hospedado
- [ ] Garantir que a landing explica: "teste grátis por 14 dias, sem cartão"

> ℹ️ Spec da landing existe em `docs/superpowers/specs/2026-04-24-landing-page-design.md`, mas implementação ainda não começou.

---

## BLOCO 7 — Convidar os 10 usuários

- [ ] Criar lista dos 10 convidados (nome + email + contexto — por que cada um)
- [ ] Enviar convite manual por WhatsApp/email com link direto para `/signup`
- [ ] Mensagem de boas-vindas deve deixar claro: é beta, bugs esperados, feedback bem-vindo
- [ ] Canal de feedback: grupo WhatsApp ou formulário simples (Typeform/Google Forms)

---

## BLOCO 8 — Monitoramento durante o beta

- [ ] **Supabase Logs** (Dashboard → Logs → API/Auth/Edge Functions) — checar diariamente na primeira semana
- [ ] **Erros no app** — considerar adicionar Sentry (free tier) para capturar erros JS em produção
- [ ] **Trials** — acompanhar coluna `trial_ends_at` na tabela `assinaturas`; estender manualmente se necessário via Table Editor
- [ ] **Evolution API** — checar Railway logs se algum user reportar que WhatsApp não funciona

---

## BLOCO 9 — O que NÃO fazer no beta

- Não adicionar Stripe ainda — Plan 4 vem depois do feedback
- Não abrir cadastro público — somente convites manuais
- Não prometer SLA — é beta, deixar claro para os usuários

---

## Ordem sugerida de execução

1. Bloco 2 (testes) → Bloco 1 (banco produção) → Bloco 3 (hospedagem) → Bloco 4 (auth/onboarding) → Bloco 5 (WhatsApp) → Bloco 6 (landing) → Bloco 7 (convites) → Bloco 8 (monitorar)

**How to apply:** Usar este checklist como ponto de partida de cada sessão de trabalho até o beta estar ao vivo.

---

## 📊 Status atualizado em 2026-05-03

| Bloco | Progresso | Próximo passo |
|-------|-----------|---------------|
| 1 — Banco produção | 🟡 Código pronto, falta deploy | Rodar migrations + deploy functions em prod |
| 2 — Testes | 🟡 Fixes feitos, não commitados | `npm test` + commit |
| 3 — Hospedagem | 🔴 Não iniciado | Escolher Vercel e fazer deploy |
| 4 — Auth/Onboarding | 🟡 OnboardingPage OK, falta SignupPage | Criar `/signup` |
| 5 — WhatsApp | 🟡 Código OK, falta teste e2e | Testar fluxo completo |
| 6 — Landing | 🔴 Spec existe, código não | Implementar ou usar Canva |
| 7-9 — Ops | 🔴 Não iniciado | Depende de 1-6 |
