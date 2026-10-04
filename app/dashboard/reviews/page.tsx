export default function ReviewsPage() {
  const reviews = [
    { name: "Sarah Kim", rating: 5, text: "Fast response and a very smooth booking experience.", time: "Today" },
    { name: "David Parker", rating: 5, text: "The team followed up immediately and made everything easy.", time: "Yesterday" },
    { name: "Maria Gonzalez", rating: 4, text: "Great service. I would use them again.", time: "2 days ago" },
  ];

  return (
    <div className="j10-product-page">
      <header className="j10-product-heading">
        <div><p>J10 REVIEWS</p><h1>Reputation</h1><span>Request feedback, reply faster, and catch unhappy customers early.</span></div>
        <button type="button">Request reviews</button>
      </header>
      <section className="j10-booking-summary">
        <div><span>Average rating</span><strong>4.8</strong></div>
        <div><span>New this month</span><strong>18</strong></div>
        <div><span>Reply rate</span><strong>94%</strong></div>
        <div><span>Needs reply</span><strong>2</strong></div>
      </section>
      <section className="j10-product-panel" style={{ marginTop: 12 }}>
        <div className="j10-product-panel-title"><h2>Recent reviews</h2><span>Google Business Profile</span></div>
        <div className="j10-review-list">
          {reviews.map((review) => (
            <article key={review.name}>
              <div><strong>{review.name}</strong><span>{"★".repeat(review.rating)}</span></div>
              <p>{review.text}</p><time>{review.time}</time>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
