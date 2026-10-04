"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, LockKeyhole, Send, ShieldCheck, Sparkles } from "lucide-react";
import { answerPublicQuestion } from "@/lib/marketing/public-faq";
import { PLANS } from "@/lib/billing/plans";
import s from "./royal-marketing.module.css";

const imageRoot = "/brand/royal/";
const stages = [
  { name: "Lead captured", summary: "A new inquiry comes in from your website, ad, call or form.", outcome: "The lead is saved to your workspace and your team can review it." },
  { name: "J10 answers", summary: "J10 responds to supported incoming conversations using your approved business information.", outcome: "The visitor gets a timely reply, with conversation history available." },
  { name: "Lead qualified", summary: "J10 asks relevant questions to identify what the visitor needs.", outcome: "Your team can prioritize the opportunities that need attention." },
  { name: "Appointment booked", summary: "An eligible customer selects an available appointment slot.", outcome: "The confirmed booking is reflected in your connected scheduling flow." },
  { name: "Deposit collected", summary: "Send a secure payment request through your configured payment provider.", outcome: "Payment status is recorded when the provider confirms it." },
  { name: "Follow-up sent", summary: "An approved workflow sends the next message when the channel permits it.", outcome: "Your team can see the follow-up and take over when needed." },
];
const products = [
  { title: "J10 Command Center", detail: "See leads, conversations, bookings and activity together." },
  { title: "J10 Lead Center", detail: "Capture, organize and qualify your opportunities." },
  { title: "J10 Inbox", detail: "Manage supported customer conversations in one place." },
  { title: "J10 Booking", detail: "Turn qualified inquiries into appointments." },
  { title: "J10 Growth", detail: "Build lead capture and follow-up campaigns." },
  { title: "J10 AI Operator", detail: "Configure AI assistance and escalation rules." },
  { title: "J10 Pay", detail: "Manage supported payment links and billing activity." },
];
const plans = PLANS.filter(plan => ["starter", "growth", "business"].includes(plan.id));
const faqs = [
  { q: "How does the 72-hour trial work?", a: "Your 72-hour trial begins after you complete and approve Outcome Onboarding." },
  { q: "How quickly can we get set up?", a: "Setup depends on your channels, provider approvals and the workflows you choose. J10 guides you through the required steps." },
  { q: "Which channels are supported?", a: "Available channels depend on your connected providers and enabled integrations. Check Connections for the current status of each channel." },
  { q: "Can I cancel anytime?", a: "Review your plan and billing terms before checkout. Your account's billing controls show available cancellation options." },
  { q: "How is my data protected?", a: "J10 uses workspace-scoped access, encrypted credential storage and authorization checks. See Security and Privacy for the current details." },
];

function ReferenceArt({ src, alt }: { src: string; alt: string }) {
  return <div className={s.art}><Image src={`${imageRoot}${src}`} alt={alt} width={1672} height={941} sizes="(max-width: 900px) 100vw, 1200px" className={s.artImage} /></div>;
}

export default function RoyalMarketingSections() {
  const [step, setStep] = useState(0);
  const [product, setProduct] = useState(0);
  const [yearly, setYearly] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState<{ sender: "visitor" | "j10"; text: string }[]>([]);
  const chatLog = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) {
        entry.target.animate([{ opacity: 0.3, transform: "translateY(24px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 650, easing: "ease-out" });
        observer.unobserve(entry.target);
      }});
    }, { threshold: 0.12 });
    pageRef.current?.querySelectorAll("section").forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  useEffect(() => { chatLog.current?.scrollTo({ top: chatLog.current.scrollHeight, behavior: "smooth" }); }, [chat]);
  function ask(value: string) {
    const clean = value.trim().slice(0, 500);
    if (!clean) return;
    setChat(previous => [...previous.slice(-16), { sender: "visitor", text: clean }, { sender: "j10", text: answerPublicQuestion(clean) }]);
    setQuestion("");
  }
  return <div className={s.page} ref={pageRef}>
    <section id="j10-products" className={s.section} aria-labelledby="j10-products-heading">
      <p className={s.kicker}>THE J10 PRODUCT SYSTEM</p>
      <h2 id="j10-products-heading">Seven J10 products. <span>One business operator.</span></h2>
      <p className={s.intro}>Everything works from one workspace.</p>
      <ReferenceArt src="product-system.webp" alt="Seven J10 products connected to the central J10 Command Center" />
      <div className={s.productSelector} aria-label="Explore the J10 product system">
        <div className={s.pills}>{products.map((p, i) => <button key={p.title} type="button" aria-pressed={product === i} className={product === i ? s.selected : ""} onClick={() => setProduct(i)}>{p.title}</button>)}</div>
        <p role="status"><strong>{products[product].title}</strong> · {products[product].detail}</p>
      </div>
    </section>

    <section id="j10-workflow" className={s.section} aria-labelledby="j10-workflow-heading">
      <p className={s.kicker}>THE MONEY WORKFLOW</p>
      <h2 id="j10-workflow-heading">One conversation. <span>One complete path to revenue.</span></h2>
      <p className={s.intro}>Explore how a customer can move from first inquiry to follow-up through a configured J10 workflow.</p>
      <ReferenceArt src="revenue-journey.webp" alt="J10 revenue journey from lead capture through response, qualification, booking, deposit and follow-up" />
      <div className={s.workflow}>
        <div className={s.pills}>{stages.map((item, index) => <button key={item.name} type="button" onClick={() => setStep(index)} aria-pressed={step === index} className={step === index ? s.selected : ""}><small>{String(index + 1).padStart(2, "0")}</small> {item.name}</button>)}</div>
        <div className={s.workflowDetails}><div><span className={s.kicker}>STEP {String(step + 1).padStart(2, "0")}</span><h3>{stages[step].name}</h3><p>{stages[step].summary}</p></div><div><strong>Expected result</strong><p>{stages[step].outcome}</p></div></div>
        <div className={s.controls}><button type="button" aria-label="Previous stage" onClick={() => setStep(v => (v + stages.length - 1) % stages.length)}><ArrowLeft size={18} /></button><span>{step + 1} / {stages.length}</span><button type="button" aria-label="Next stage" onClick={() => setStep(v => (v + 1) % stages.length)}><ArrowRight size={18} /></button></div>
      </div>
    </section>

    <section id="j10-trust" className={s.section} aria-labelledby="j10-trust-heading">
      <p className={s.kicker}>BUILT FOR TRUST</p><h2 id="j10-trust-heading">Built for small businesses. <span>Engineered with care.</span></h2>
      <p className={s.intro}>Protected credentials, workspace-scoped access and controls designed to keep your team in charge.</p>
      <ReferenceArt src="trust.webp" alt="J10 security and founder vision design featuring encrypted credentials, isolated workspaces, webhook protection and human escalation" />
      <div className={s.founder}><Image src={`${imageRoot}founder-original.png`} alt="Jeefthe Richeder Osne, founder and CEO of J10 NEXUS" width={1254} height={1254} quality={100} unoptimized sizes="(max-width: 700px) 160px, 230px" /><div><span className={s.kicker}>FROM THE FOUNDER</span><h3>Jeefthe Richeder Osne</h3><p className={s.muted}>Founder &amp; CEO, J10 NEXUS</p><p>I built J10 NEXUS because small service businesses shouldn't lose customers to missed calls, slow follow-ups and disconnected tools. My goal is to give owners one affordable place to run their customer operations.</p><a href="https://www.linkedin.com/in/jeefthe-osne-143a9126b/" target="_blank" rel="noopener noreferrer">Connect on LinkedIn <ArrowRight size={16}/></a></div></div>
    </section>

    <section id="ask-j10-live" className={s.section} aria-labelledby="ask-j10-heading">
      <p className={s.kicker}>ASK J10 LIVE</p><h2 id="ask-j10-heading">Experience J10 <span>before you sign up.</span></h2>
      <p className={s.intro}>Ask about J10's features, plans and getting started. This public assistant answers product questions; it does not modify accounts or create bookings.</p>
      <ReferenceArt src="ask-j10.webp" alt="Ask J10 interactive chat showcase with product questions, lead qualification and signup help" />
      <div className={s.chatPanel}><div className={s.chatHeader}><Sparkles size={20}/><strong>Ask J10</strong><span>Public product FAQ</span></div><div className={s.chatLog} ref={chatLog} role="log" aria-label="Ask J10 conversation" aria-live="polite">{chat.length === 0 && <p className={s.greeting}>Hi! Ask me about J10 features, pricing, the trial or integrations. Please don't share private information.</p>}{chat.map((item, index) => <p key={index} className={item.sender === "visitor" ? s.visitor : s.bot}><span className="sr-only">{item.sender === "visitor" ? "You" : "J10"}: </span>{item.text}</p>)}</div><div className={s.pills}>{["Pricing", "72-hour trial", "Integrations"].map(q => <button key={q} type="button" onClick={() => ask(q)}>{q}</button>)}</div><form onSubmit={e => {e.preventDefault(); ask(question);}}><input aria-label="Ask J10 a question" value={question} onChange={e => setQuestion(e.target.value)} maxLength={500} placeholder="Ask J10 anything about the product..."/><button type="submit" disabled={!question.trim()} aria-label="Send question"><Send size={19}/></button></form><div className={s.chatFoot}><LockKeyhole size={14}/> Account changes require sign-in. <Link href="/signup">Create an account <ArrowRight size={14}/></Link></div></div>
    </section>

    <section id="j10-pricing" className={s.section} aria-labelledby="j10-pricing-heading">
      <p className={s.kicker}>SIMPLE, TRANSPARENT PRICING</p><h2 id="j10-pricing-heading">Choose the plan <span>for your business.</span></h2>
      <p className={s.intro}>Start with what you need and grow when you're ready. Provider usage fees may be billed separately.</p>
      <ReferenceArt src="pricing.webp" alt="J10 Starter, Growth and Business pricing, frequently asked questions and final signup call to action" />
      <div className={s.billing} role="group" aria-label="Billing frequency"><button type="button" className={!yearly ? s.selected : ""} aria-pressed={!yearly} onClick={() => setYearly(false)}>Monthly</button><button type="button" className={yearly ? s.selected : ""} aria-pressed={yearly} onClick={() => setYearly(true)}>Yearly <span>Annual billing</span></button></div>
      <div className={s.planGrid}>{plans.map(plan => <article key={plan.name} className={`${s.plan} ${plan.popular ? s.popular : ""}`}>{plan.popular && <span className={s.popularLabel}>MOST POPULAR</span>}<h3>{plan.name}</h3><p>{plan.description}</p><strong className={s.price}>${yearly ? ((plan.annualPrice ?? plan.price * 12) / 12).toFixed(2).replace(/\.00$/, "") : plan.price}<small>/mo</small></strong>{yearly && <p className={s.muted}>${plan.annualPrice} billed annually</p>}<ul>{plan.features.slice(1, 7).map(feature => <li key={feature}><Check size={16}/>{feature}</li>)}</ul><Link href={`/signup?plan=${plan.id}&interval=${yearly ? "year" : "month"}&trial=1`}>Start Free <ArrowRight size={17}/></Link></article>)}</div>
      <p className={s.billingNotice}>72-hour trial starts after Outcome Onboarding approval. Provider usage charges are billed separately.</p>
      <h3 className={s.faqTitle}>Frequently asked questions</h3><div className={s.faqGrid}>{faqs.map((item, index) => <div key={item.q} className={s.faqItem}><button type="button" aria-expanded={openFaq === index} onClick={() => setOpenFaq(openFaq === index ? null : index)}>{item.q}<ChevronDown size={18} className={openFaq === index ? s.rotated : ""}/></button>{openFaq === index && <p>{item.a}</p>}</div>)}</div>
      <div className={s.lastCta}><ShieldCheck size={29}/><h3>Put J10 to work <span>for your business.</span></h3><p>Capture opportunities, simplify customer operations and give your team more time to focus.</p><div><Link href="/signup">Start Free <ArrowRight size={18}/></Link><a href="#ask-j10-live">Talk to J10 <ArrowRight size={18}/></a></div></div>
    </section>
  </div>;
}
