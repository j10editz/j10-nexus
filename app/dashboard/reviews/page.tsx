"use client";
import { useState } from "react";
const reviews = [
  { name: "Sarah Kim", initials: "SK", rating: 5, text: "Fast response and a very smooth booking experience.", time: "Today" },
  { name: "David Parker", initials: "DP", rating: 5, text: "The team followed up immediately and made everything easy.", time: "Yesterday" },
  { name: "Maria Gonzalez", initials: "MG", rating: 4, text: "Great service. I would use them again.", time: "2 days ago" },
];
export default function ReviewsPage() {
  const [filter, setFilter] = useState<"all" | "reply">("all");
  return <div className="j10-reviews-page">
    <header className="j10-saas-head"><div><p>J10 REVIEWS</p><h1>Your reputation, at a glance</h1><span>Monitor feedback, respond quickly, and turn happy customers into repeat business.</span></div><button type="button">Request a review</button></header>
    <section className="j10-review-overview">
      <div className="j10-score"><span>Overall rating</span><strong>4.8</strong><div className="j10-stars">★★★★★</div><small>Based on 126 reviews</small></div>
      <div className="j10-score-bars">{[92,6,2].map((width,index)=><div key={width}><span>{5-index} star</span><i><b style={{width:`${width}%`}} /></i><em>{width}%</em></div>)}</div>
      <div className="j10-review-stats"><div><span>This month</span><strong>18</strong><small>+12% from last month</small></div><div><span>Reply rate</span><strong>94%</strong><small>2 still need attention</small></div></div>
    </section>
    <section className="j10-review-feed">
      <div className="j10-feed-head"><div><h2>Recent reviews</h2><span>Connected to Google Business Profile</span></div><nav><button className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>All</button><button className={filter==="reply"?"active":""} onClick={()=>setFilter("reply")}>Needs reply <b>2</b></button></nav></div>
      {reviews.map((review,index)=><article key={review.name}><div className="j10-avatar">{review.initials}</div><div className="j10-review-copy"><div><strong>{review.name}</strong><span>Google · {review.time}</span></div><div className="j10-stars">{"★".repeat(review.rating)}<i>{"★".repeat(5-review.rating)}</i></div><p>{review.text}</p></div><button type="button">{index===0?"View reply":"Reply"}</button></article>)}
    </section>
  </div>;
}
