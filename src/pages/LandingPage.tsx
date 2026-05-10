import { useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import './LandingPage.css'

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 10, height: 10 }}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
)

export function LandingPage() {
  const { session, loading } = useAuth()

  if (!loading && session) return <Navigate to="/agenda" replace />

  useEffect(() => {
    const reveals = document.querySelectorAll('.lp-root .reveal')
    document.querySelectorAll('#lp-hero .reveal').forEach((el, i) => {
      setTimeout(() => el.classList.add('in'), 80 + i * 100)
    })
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            obs.unobserve(e.target)
          }
        })
      },
      { threshold: 0.08, rootMargin: '0px 0px -36px 0px' }
    )
    reveals.forEach((el) => {
      if (!el.closest('#lp-hero')) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [])

  return (
    <div className="lp-root">
      {/* NAV */}
      <nav className="lp-nav">
        <a href="#" className="lp-nav-brand">
          <div className="lp-nav-logo">
            <svg viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13, position: 'relative', zIndex: 2 }}>
              <path d="M5 4 L5 16 L13 16" />
            </svg>
          </div>
          <span className="lp-nav-name">Lume<span>Care</span></span>
        </a>
        <div className="lp-nav-links">
          <a href="#lp-pricing" className="lp-nav-link">Planos</a>
          <a href="#lp-features" className="lp-nav-link">Funcionalidades</a>
          <Link to="/login" className="lp-nav-login">Entrar</Link>
          <a href="#lp-cta" className="lp-nav-cta">Começar grátis</a>
        </div>
      </nav>

      {/* HERO */}
      <section id="lp-hero">
        <div className="lp-blob-container">
          <div className="lp-blob lp-blob-1" />
          <div className="lp-blob lp-blob-2" />
          <div className="lp-blob lp-blob-3" />
        </div>

        <svg className="lp-hero-shape" viewBox="0 0 560 560" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M420 40 C520 80 580 200 560 320 C540 440 440 520 320 530 C200 540 80 480 40 380 C0 280 30 140 120 80 C210 20 320 0 420 40Z" fill="rgba(45,106,104,0.055)" />
          <path d="M380 80 C460 110 510 210 490 320 C470 430 380 490 280 495 C180 500 90 450 60 360 C30 270 55 155 130 100 C205 45 300 50 380 80Z" fill="rgba(232,184,75,0.06)" />
        </svg>

        <div className="lp-hero-inner">
          <div className="lp-hero-left">
            <div className="lp-hero-kicker reveal">
              <div className="lp-hero-kicker-dot" />
              <span className="lp-hero-kicker-text">Para psicólogas e psicólogos</span>
            </div>
            <h1 className="lp-hero-h1 reveal d1">
              Liberdade para<br />
              <em>cuidar de</em><br />
              <span className="lp-lume-word">pessoas.</span>
            </h1>
            <p className="lp-hero-sub reveal d2">
              O Lume Care cuida da agenda, dos lembretes e do financeiro — para que você possa se dedicar inteiramente às sessões que importam.
            </p>
            <div className="lp-hero-btns reveal d3">
              <Link to="/login" className="lp-btn-hero-primary">Experimentar grátis</Link>
              <a href="#lp-features" className="lp-btn-hero-ghost">Como funciona</a>
            </div>
            <div className="lp-hero-social-proof reveal d4">
              <div className="lp-proof-avatars">
                <div className="lp-proof-avatar" style={{ background: '#EAF6F5', color: '#2D6A68' }}>CM</div>
                <div className="lp-proof-avatar" style={{ background: '#F5E6DC', color: '#7A3820' }}>RF</div>
                <div className="lp-proof-avatar" style={{ background: '#F5F0FA', color: '#6B3FA0' }}>LT</div>
                <div className="lp-proof-avatar" style={{ background: '#E4F0E8', color: '#2A5A38' }}>PB</div>
              </div>
              <div className="lp-proof-text">
                <strong>+200 psicólogos</strong> já simplificaram sua rotina
              </div>
            </div>
          </div>

          <div className="lp-hero-right reveal d2">
            <div className="lp-product-card">
              <div className="lp-card-header">
                <div className="lp-card-header-left">
                  <div className="lp-card-header-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                  </div>
                  <div>
                    <div className="lp-card-title">Minha agenda</div>
                    <div className="lp-card-date">Quinta, 17 de abril</div>
                  </div>
                </div>
                <span className="lp-card-badge">5 sessões hoje</span>
              </div>
              <div className="lp-card-body">
                <div className="lp-session-row done">
                  <span className="lp-session-time">08h00</span>
                  <div className="lp-session-av" style={{ background: '#E4F6EE', color: '#2A7A52' }}>AC</div>
                  <div className="lp-session-info">
                    <div className="lp-session-name">Ana Costa</div>
                    <div className="lp-session-type">Individual · 50 min</div>
                  </div>
                  <span className="lp-session-tag" style={{ background: '#E4F6EE', color: '#2A7A52' }}>Concluída</span>
                </div>
                <div className="lp-session-row conf">
                  <span className="lp-session-time">09h00</span>
                  <div className="lp-session-av" style={{ background: '#EAF6F5', color: '#2D6A68' }}>MF</div>
                  <div className="lp-session-info">
                    <div className="lp-session-name">Marcos Faria</div>
                    <div className="lp-session-type">Individual · 50 min</div>
                  </div>
                  <span className="lp-session-tag" style={{ background: '#EAF6F5', color: '#2D6A68' }}>Confirmada</span>
                </div>
                <div className="lp-session-row sched">
                  <span className="lp-session-time">10h00</span>
                  <div className="lp-session-av" style={{ background: '#F2EEF8', color: '#6B3FA0' }}>LR</div>
                  <div className="lp-session-info">
                    <div className="lp-session-name">Lúcia Ramos</div>
                    <div className="lp-session-type">Individual · 50 min</div>
                  </div>
                  <span className="lp-session-tag" style={{ background: '#F0F0EE', color: '#7A7A70' }}>Agendada</span>
                </div>
                <div className="lp-session-row" style={{ borderLeftColor: '#E8B84B' }}>
                  <span className="lp-session-time">11h00</span>
                  <div className="lp-session-av" style={{ background: '#FDF3D0', color: '#7A5C10' }}>PB</div>
                  <div className="lp-session-info">
                    <div className="lp-session-name">Paulo Braga</div>
                    <div className="lp-session-type">Individual · 50 min</div>
                  </div>
                  <span className="lp-session-tag" style={{ background: '#FDF3D0', color: '#7A5C10' }}>Lembrete ✓</span>
                </div>
              </div>
            </div>

            <div className="lp-wa-float">
              <div className="lp-wa-icon">
                <svg viewBox="0 0 24 24" fill="white" style={{ width: 14, height: 14 }}>
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a9 9 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" />
                  <path d="M11.5 2C6.262 2 2 6.262 2 11.5c0 1.67.44 3.243 1.206 4.606L2 22l6.056-1.188A9.446 9.446 0 0011.5 21C16.738 21 21 16.738 21 11.5S16.738 2 11.5 2z" />
                </svg>
              </div>
              <div className="lp-wa-text">
                <b>Lume Care · Lembrete</b>
                Lúcia, sua sessão é amanhã às 10h. Confirma? 😊
              </div>
            </div>

            <div className="lp-lume-badge">
              <div className="lp-lume-badge-label">💛 Hoje</div>
              <div className="lp-lume-badge-val">R$ 800</div>
              <div className="lp-lume-badge-sub">3 de 5 sessões</div>
            </div>
          </div>
        </div>
      </section>

      {/* PAIN */}
      <section id="lp-pain">
        <div className="lp-pain-top">
          <div className="lp-pain-eyebrow reveal">O problema real</div>
          <h2 className="lp-pain-h2 reveal d1">Você reconhece essa sensação?</h2>
          <p className="lp-pain-sub reveal d2">A maioria dos psicólogos perde horas por semana com tarefas que não deveriam ser seus problemas.</p>
        </div>
        <div className="lp-pain-grid">
          <div className="lp-pain-card reveal">
            <div className="lp-pain-num">01 —</div>
            <h3>Agenda em três lugares</h3>
            <p>WhatsApp, caderno, planilha — uma informação sempre cai no vão e você só percebe quando o paciente não aparece.</p>
          </div>
          <div className="lp-pain-card reveal d1">
            <div className="lp-pain-num">02 —</div>
            <h3>Faltas sem aviso</h3>
            <p>O paciente esqueceu. A sessão foi perdida. Você só descobriu quando já estava esperando — com energia desperdiçada.</p>
          </div>
          <div className="lp-pain-card reveal d2">
            <div className="lp-pain-num">03 —</div>
            <h3>Financeiro no escuro</h3>
            <p>Quem pagou? Quem está devendo? Quanto entrou esse mês? Sem clareza, a ansiedade aparece antes mesmo do extrato.</p>
          </div>
        </div>
      </section>

      {/* TURN */}
      <section id="lp-turn">
        <div className="lp-turn-line reveal" />
        <blockquote className="lp-turn-quote reveal d1">
          "E se tudo isso pudesse simplesmente <mark>funcionar</mark> — enquanto você se dedica ao que mais importa?"
        </blockquote>
        <p className="lp-turn-sub reveal d2">Não é sobre tecnologia. É sobre ter clareza, espaço mental e tranquilidade para exercer sua profissão com presença total.</p>
      </section>

      {/* FEATURES */}
      <section id="lp-features">
        <div className="lp-features-bg">
          <div className="lp-feat-header">
            <div className="lp-feat-header-left">
              <div className="lp-feat-eyebrow reveal">Como o Lume Care ajuda</div>
              <h2 className="lp-feat-h2 reveal d1">Tudo que você precisa,<br />em um só lugar.</h2>
            </div>
            <p className="lp-feat-header-right reveal d2">Desenhado para a realidade de quem atende pessoas — não para gestores de TI ou grandes clínicas.</p>
          </div>
          <div className="lp-feat-grid">
            <div className="lp-feat-card reveal">
              <div className="lp-feat-card-icon" style={{ background: 'var(--lp-teal-soft)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--lp-teal)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
                  <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="M8 14h.01M12 14h.01M16 14h.01" />
                </svg>
              </div>
              <h3>Agenda diária + Kanban visual</h3>
              <p>Duas formas de ver seus atendimentos: agenda do dia com horários detalhados, ou Kanban por status — agendada, confirmada, concluída, faltou. Escolha como preferir trabalhar.</p>
            </div>
            <div className="lp-feat-card reveal d1">
              <div className="lp-feat-card-icon" style={{ background: 'var(--lp-gold-soft)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#8A6010" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h3>Lembretes automáticos no WhatsApp</h3>
              <p>O sistema envia um lembrete com botão de confirmação no dia anterior à sessão. A resposta do paciente atualiza o status automaticamente — sem você tocar no celular.</p>
            </div>
            <div className="lp-feat-card reveal d2">
              <div className="lp-feat-card-icon" style={{ background: 'var(--lp-terra-soft)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--lp-terra)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <h3>Régua de cobrança automática</h3>
              <p>Configure sequências de mensagens para pacientes com pagamento pendente. O sistema dispara no momento certo — por WhatsApp, sem constrangimento, sem esforço da sua parte.</p>
            </div>
            <div className="lp-feat-card reveal d1">
              <div className="lp-feat-card-icon" style={{ background: 'var(--lp-sage-soft)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--lp-sage)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
                  <path d="M21 10V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" /><path d="M16 2v4M8 2v4M3 10h18" /><circle cx="18" cy="18" r="4" /><path d="M18 16v2l1 1" />
                </svg>
              </div>
              <h3>Sincronização com Google Calendar</h3>
              <p>Suas sessões aparecem no Google Calendar automaticamente — e eventos externos bloqueiam horários no Lume Care. Sincronização bidirecional, a cada 5 minutos.</p>
            </div>
            <div className="lp-feat-card reveal d2">
              <div className="lp-feat-card-icon" style={{ background: 'var(--lp-teal-soft)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--lp-teal)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3>Alerta de pacientes em risco</h3>
              <p>O sistema identifica automaticamente quem está sumindo — pacientes com muitas faltas ou sem sessões recentes. Você recebe o alerta e pode enviar uma mensagem de reaproximação com um clique.</p>
            </div>
            <div className="lp-feat-card reveal d3">
              <div className="lp-feat-card-icon" style={{ background: 'var(--lp-gold-soft)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#8A6010" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
                  <path d="M3 3v18h18" /><path d="M7 14l4-4 4 4 5-6" />
                </svg>
              </div>
              <h3>Financeiro completo por paciente</h3>
              <p>Receita mensal, histórico de pagamentos por paciente, controle de inadimplência e repasses para clínica — tudo em um painel claro, sem planilhas, sem surpresas.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FLOW */}
      <section id="lp-flow">
        <div className="lp-flow-inner">
          <div className="lp-flow-header">
            <div className="lp-flow-eyebrow reveal">Como funciona</div>
            <h2 className="lp-flow-h2 reveal d1">Da sessão ao pagamento, em quatro passos</h2>
          </div>
          <div className="lp-flow-steps">
            <div className="lp-flow-step reveal">
              <div className="lp-flow-circle c1">1</div>
              <h4>Cadastre o paciente</h4>
              <p>Nome, contato e valor da sessão. Menos de um minuto.</p>
            </div>
            <div className="lp-flow-step reveal d1">
              <div className="lp-flow-circle c2">2</div>
              <h4>Agende a sessão</h4>
              <p>Escolha data e horário. A agenda se organiza sozinha.</p>
            </div>
            <div className="lp-flow-step reveal d2">
              <div className="lp-flow-circle c3">3</div>
              <h4>Lembrete automático</h4>
              <p>O paciente recebe no WhatsApp e confirma presença.</p>
            </div>
            <div className="lp-flow-step reveal d3">
              <div className="lp-flow-circle c4">4</div>
              <h4>Registre e feche</h4>
              <p>Marque como concluída e veja o financeiro em tempo real.</p>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIAL */}
      <section id="lp-testimonial">
        <div className="lp-test-stars reveal">
          <span className="lp-test-star">★</span>
          <span className="lp-test-star">★</span>
          <span className="lp-test-star">★</span>
          <span className="lp-test-star">★</span>
          <span className="lp-test-star">★</span>
        </div>
        <blockquote className="lp-test-q reveal d1">
          "Antes eu gastava quase uma hora por dia só gerenciando mensagens e lembretes. Hoje abro o Lume Care de manhã e já sei o que me espera — sem estresse."
        </blockquote>
        <div className="lp-test-byline reveal d2">
          <div className="lp-test-av">CM</div>
          <div>
            <div className="lp-test-name">Camila Mendes</div>
            <div className="lp-test-role">Psicóloga clínica · São Paulo, SP</div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="lp-pricing">
        <div className="lp-pricing-inner">
          <div className="lp-pricing-header">
            <div className="lp-pricing-eyebrow reveal">Planos</div>
            <h2 className="lp-pricing-h2 reveal d1">Simples, transparente, justo</h2>
            <p className="lp-pricing-sub reveal d2">Sem surpresas. Sem taxas escondidas. Cancele quando quiser.</p>
          </div>
          <div className="lp-plans">
            <div className="lp-plan reveal">
              <div className="lp-plan-name">Básico</div>
              <p className="lp-plan-desc">O essencial para organizar sua rotina e nunca mais perder uma sessão por esquecimento.</p>
              <div className="lp-plan-price">
                <span className="lp-plan-cur">R$</span>
                <span className="lp-plan-amt">79</span>
                <span className="lp-plan-per">/mês</span>
              </div>
              <div className="lp-plan-feats">
                <div className="lp-plan-feat"><div className="lp-feat-check"><CheckIcon /></div>Agenda completa de sessões</div>
                <div className="lp-plan-feat"><div className="lp-feat-check"><CheckIcon /></div>Lembretes automáticos por WhatsApp</div>
                <div className="lp-plan-feat"><div className="lp-feat-check"><CheckIcon /></div>Confirmação de presença dos pacientes</div>
                <div className="lp-plan-feat"><div className="lp-feat-check"><CheckIcon /></div>Painel financeiro básico</div>
                <div className="lp-plan-feat"><div className="lp-feat-check"><CheckIcon /></div>Até 30 pacientes ativos</div>
              </div>
              <Link to="/login" className="lp-plan-btn lp-plan-btn-outline">Começar com o Básico</Link>
            </div>

            <div className="lp-plan featured reveal d1">
              <div className="lp-plan-rec">✦ Recomendado</div>
              <div className="lp-plan-name">Premium</div>
              <p className="lp-plan-desc">Tudo do Básico, mais recursos avançados que crescem com a sua prática ao longo do tempo.</p>
              <div className="lp-plan-price">
                <span className="lp-plan-cur">R$</span>
                <span className="lp-plan-amt">149</span>
                <span className="lp-plan-per">/mês</span>
              </div>
              <div className="lp-plan-feats">
                <div className="lp-plan-feat"><div className="lp-feat-check"><CheckIcon /></div>Tudo do plano Básico</div>
                <div className="lp-plan-feat"><div className="lp-feat-check"><CheckIcon /></div>Pacientes ilimitados</div>
                <div className="lp-plan-feat"><div className="lp-feat-check"><CheckIcon /></div>Relatórios financeiros avançados</div>
                <div className="lp-plan-feat"><div className="lp-feat-check"><CheckIcon /></div>Prontuário clínico simplificado</div>
                <div className="lp-feat-soon"><div className="lp-soon-ring" /><span>Link de agendamento público<span className="lp-soon-pill">em breve</span></span></div>
                <div className="lp-feat-soon"><div className="lp-soon-ring" /><span>Mensagens pós-sessão automáticas<span className="lp-soon-pill">em breve</span></span></div>
                <div className="lp-feat-soon"><div className="lp-soon-ring" /><span>Acesso prioritário a novos recursos<span className="lp-soon-pill">sempre</span></span></div>
              </div>
              <Link to="/login" className="lp-plan-btn lp-plan-btn-gold">Começar com o Premium</Link>
            </div>
          </div>
          <p style={{ textAlign: 'center', marginTop: 24, fontSize: '12.5px', color: 'var(--lp-ink-muted)' }} className="reveal">
            14 dias grátis em qualquer plano · Sem cartão de crédito para começar
          </p>
        </div>
      </section>

      {/* CTA FINAL */}
      <section id="lp-cta">
        <div className="lp-cta-blob" />
        <div className="lp-cta-mark reveal">
          <svg viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13, position: 'relative', zIndex: 1 }}>
            <path d="M5 4 L5 16 L13 16" />
          </svg>
        </div>
        <h2 className="lp-cta-h2 reveal d1">
          Cuide das pessoas.<br />
          <span className="gold">Deixe o resto<br />com a gente.</span>
        </h2>
        <p className="lp-cta-sub reveal d2">Comece agora e transforme sua rotina em algo mais leve, organizado e com muito mais espaço para o que realmente importa — suas sessões.</p>
        <div className="lp-cta-btns reveal d3">
          <Link to="/login" className="lp-btn-hero-primary" style={{ fontSize: 16, padding: '16px 36px' }}>Experimentar grátis por 14 dias</Link>
        </div>
        <p className="lp-cta-note reveal d4">Sem cartão de crédito · Configuração em minutos · Suporte humano incluído</p>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div className="lp-footer-brand">
            <div className="lp-footer-logo">
              <svg viewBox="0 0 20 20" fill="none" stroke="rgba(232,184,75,0.8)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}>
                <path d="M5 4 L5 16 L13 16" />
              </svg>
            </div>
            <span className="lp-footer-name">LumeCare</span>
          </div>
          <span className="lp-footer-copy">© 2026 Lume Care · Todos os direitos reservados</span>
        </div>
        <div className="lp-footer-links">
          <a href="#">Privacidade</a>
          <a href="#">Termos</a>
          <a href="#">Contato</a>
        </div>
      </footer>
    </div>
  )
}
