"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect,useRef,useState } from "react";
import { ArrowLeft,ArrowRight,CalendarCheck,Check,ChevronDown,CreditCard,Inbox,LayoutDashboard,LockKeyhole,Megaphone,MessageSquareText,ShieldCheck,Sparkles,Target,UserRoundCheck,Workflow } from "lucide-react";
import { PLANS } from "@/lib/billing/plans";
import s from "./royal-marketing.module.css";

const stages=[
  {name:"Lead captured",summary:"A new inquiry arrives from your website, ad, call or form.",outcome:"The opportunity is saved instantly, with its source and contact details."},
  {name:"J10 answers",summary:"J10 responds using the business information and rules you approved.",outcome:"The customer receives a fast, consistent answer without waiting on your team."},
  {name:"Lead qualified",summary:"The AI operator asks the right questions to understand intent and fit.",outcome:"High-value opportunities are identified and ready for action."},
  {name:"Appointment booked",summary:"Qualified customers choose a real available time.",outcome:"The appointment enters your connected booking flow automatically."},
  {name:"Deposit collected",summary:"J10 sends a secure request through your configured payment provider.",outcome:"The booking is protected and payment status stays visible."},
  {name:"Follow-up sent",summary:"The next approved message is sent when the channel permits it.",outcome:"No warm lead disappears because somebody forgot to follow up."},
];
const products=[
  {title:"Command Center",detail:"See leads, conversations, bookings and activity together.",icon:LayoutDashboard},
  {title:"Lead Center",detail:"Capture, organize and qualify every opportunity.",icon:Target},
  {title:"Unified Inbox",detail:"Manage supported customer conversations in one place.",icon:Inbox},
  {title:"Booking",detail:"Turn qualified inquiries into confirmed appointments.",icon:CalendarCheck},
  {title:"Growth",detail:"Build lead capture, follow-up and reactivation campaigns.",icon:Megaphone},
  {title:"AI Operator",detail:"Configure AI assistance, knowledge and escalation rules.",icon:Sparkles},
  {title:"J10 Pay",detail:"Track payment links and supported billing activity.",icon:CreditCard},
];
const trustItems=[
  {title:"Protected credentials",copy:"Connection secrets are encrypted and never exposed in the client interface.",icon:LockKeyhole},
  {title:"Workspace isolation",copy:"Access is scoped so each business sees only its own records and activity.",icon:ShieldCheck},
  {title:"Verified webhooks",copy:"Provider events are authenticated before they can trigger business workflows.",icon:Workflow},
  {title:"Human control",copy:"Your team can review, take over and define where automation must stop.",icon:UserRoundCheck},
];
const plans=PLANS.filter(plan=>["starter","growth","business"].includes(plan.id));
const faqs=[
  {q:"How does the 72-hour trial work?",a:"Your 72-hour trial begins after you complete and approve Outcome Onboarding."},
  {q:"How quickly can we get set up?",a:"Setup depends on your channels, provider approvals and chosen workflows. J10 guides you through every required step."},
  {q:"Which channels are supported?",a:"Channel availability depends on your connected providers and enabled integrations. Connections shows the current status of each one."},
  {q:"Can I cancel anytime?",a:"Your billing controls show the cancellation options available for your active plan."},
  {q:"How is my data protected?",a:"J10 uses workspace-scoped access, encrypted credential storage and authorization checks. See Security and Privacy for details."},
];

export default function RoyalMarketingSections(){
 const [step,setStep]=useState(0),[yearly,setYearly]=useState(false),[openFaq,setOpenFaq]=useState<number|null>(0); const pageRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;const o=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.animate([{opacity:0,transform:"translateY(30px)"},{opacity:1,transform:"translateY(0)"}],{duration:700,easing:"cubic-bezier(.2,.8,.2,1)"});o.unobserve(e.target)}}),{threshold:.1});pageRef.current?.querySelectorAll("section").forEach(x=>o.observe(x));return()=>o.disconnect()},[]);
 return <div className={s.page} ref={pageRef}>
  <section id="j10-products" className={s.section} aria-labelledby="j10-products-heading">
   <div className={s.headingBlock}><p className={s.kicker}>THE J10 PRODUCT SYSTEM</p><h2 id="j10-products-heading">Seven focused products. <span>One business operator.</span></h2><p className={s.intro}>A connected operating system built around the customer journey, not a pile of disconnected tools.</p></div>
   <div className={s.productSystem}><div className={s.commandCore}><Image src="/brand/j10-expression-excited.png" alt="J10 AI operator" width={220} height={220} quality={100}/><span>J10 NEXUS</span><strong>Command Center</strong><p>One live view of the work that creates revenue.</p></div><div className={s.productGrid}>{products.map(({title,detail,icon:Icon})=><article key={title} className={s.productCard}><div><Icon size={21}/></div><h3>{title}</h3><p>{detail}</p></article>)}</div></div>
  </section>
  <section id="j10-workflow" className={s.section} aria-labelledby="j10-workflow-heading">
   <div className={s.headingBlock}><p className={s.kicker}>FROM CONVERSATION TO REVENUE</p><h2 id="j10-workflow-heading">One customer journey. <span>No dropped handoffs.</span></h2><p className={s.intro}>Follow the exact path J10 coordinates from first contact to the next follow-up.</p></div>
   <div className={s.journey}><div className={s.stageRail} role="tablist" aria-label="Revenue workflow stages">{stages.map((item,index)=><button key={item.name} type="button" role="tab" aria-selected={step===index} className={step===index?s.activeStage:""} onClick={()=>setStep(index)}><span>{String(index+1).padStart(2,"0")}</span><strong>{item.name}</strong></button>)}</div><div className={s.stagePanel} role="tabpanel"><div className={s.stageVisual}><MessageSquareText size={46}/><span>STEP {String(step+1).padStart(2,"0")}</span></div><div><p className={s.kicker}>ACTIVE WORKFLOW STAGE</p><h3>{stages[step].name}</h3><p>{stages[step].summary}</p></div><div className={s.outcome}><span>EXPECTED RESULT</span><p>{stages[step].outcome}</p></div><div className={s.controls}><button type="button" aria-label="Previous stage" onClick={()=>setStep(v=>(v+stages.length-1)%stages.length)}><ArrowLeft size={18}/></button><span>{step+1} / {stages.length}</span><button type="button" aria-label="Next stage" onClick={()=>setStep(v=>(v+1)%stages.length)}><ArrowRight size={18}/></button></div></div></div>
  </section>
  <section id="j10-trust" className={s.section} aria-labelledby="j10-trust-heading">
   <div className={s.headingBlock}><p className={s.kicker}>BUILT FOR TRUST</p><h2 id="j10-trust-heading">Automation with <span>serious infrastructure.</span></h2><p className={s.intro}>J10 is designed to move quickly without taking control away from the business owner.</p></div>
   <div className={s.trustGrid}>{trustItems.map(({title,copy,icon:Icon})=><article key={title}><Icon size={23}/><h3>{title}</h3><p>{copy}</p></article>)}</div>
   <div className={s.founder}><div className={s.founderPortrait}><Image src="/brand/royal/founder-original.png" alt="Jeefthe Richeder Osne, Founder and CEO of J10 NEXUS" width={1254} height={1254} quality={100} unoptimized sizes="(max-width: 800px) 92vw, 480px"/></div><div className={s.founderCopy}><p className={s.kicker}>FROM THE FOUNDER</p><h3>Built from the problem, not from a template.</h3><p className={s.founderName}>Jeefthe Richeder Osne <span>Founder &amp; CEO</span></p><blockquote>“I built J10 NEXUS because small service businesses should not lose customers to missed calls, slow follow-ups and disconnected tools. Owners deserve one affordable system that helps them operate and grow.”</blockquote><a href="https://www.linkedin.com/in/jeefthe-osne-143a9126b/" target="_blank" rel="noopener noreferrer">View Jeefthe on LinkedIn <ArrowRight size={17}/></a></div></div>
  </section>
  <section id="j10-pricing" className={s.section} aria-labelledby="j10-pricing-heading">
   <div className={s.headingBlock}><p className={s.kicker}>SIMPLE, TRANSPARENT PRICING</p><h2 id="j10-pricing-heading">Choose the plan <span>for your business.</span></h2><p className={s.intro}>Start with what you need and grow when you are ready. Provider usage fees may be billed separately.</p></div>
   <div className={s.billing} role="group" aria-label="Billing frequency"><button type="button" className={!yearly?s.selected:""} aria-pressed={!yearly} onClick={()=>setYearly(false)}>Monthly</button><button type="button" className={yearly?s.selected:""} aria-pressed={yearly} onClick={()=>setYearly(true)}>Yearly <span>Annual billing</span></button></div>
   <div className={s.planGrid}>{plans.map(plan=><article key={plan.name} className={`${s.plan} ${plan.popular?s.popular:""}`}>{plan.popular&&<span className={s.popularLabel}>MOST POPULAR</span>}<h3>{plan.name}</h3><p>{plan.description}</p><strong className={s.price}>${yearly?((plan.annualPrice??plan.price*12)/12).toFixed(2).replace(/\.00$/,""):plan.price}<small>/mo</small></strong>{yearly&&<p className={s.muted}>${plan.annualPrice} billed annually</p>}<ul>{plan.features.slice(1,7).map(feature=><li key={feature}><Check size={16}/>{feature}</li>)}</ul><Link href={`/signup?plan=${plan.id}&interval=${yearly?"year":"month"}&trial=1`}>Start Free <ArrowRight size={17}/></Link></article>)}</div>
   <p className={s.billingNotice}>72-hour trial starts after Outcome Onboarding approval. Provider usage charges are billed separately.</p><h3 className={s.faqTitle}>Frequently asked questions</h3><div className={s.faqGrid}>{faqs.map((item,index)=><div key={item.q} className={s.faqItem}><button type="button" aria-expanded={openFaq===index} onClick={()=>setOpenFaq(openFaq===index?null:index)}>{item.q}<ChevronDown size={18} className={openFaq===index?s.rotated:""}/></button>{openFaq===index&&<p>{item.a}</p>}</div>)}</div>
   <div className={s.lastCta}><ShieldCheck size={29}/><h3>Put J10 to work <span>for your business.</span></h3><p>Capture opportunities, simplify customer operations and give your team more time to focus.</p><div><Link href="/signup">Start Free <ArrowRight size={18}/></Link><a href="#product">See J10 in action <ArrowRight size={18}/></a></div></div>
  </section>
 </div>
}
