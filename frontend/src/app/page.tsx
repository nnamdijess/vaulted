export default function Home() {
  return (
    <main>
      <header><span className="brand">unreleased<span className="dot">.</span></span><span className="badge">LOCAL WORKSPACE</span></header>
      <section aria-labelledby="welcome-title">
        <p className="eyebrow">ROOM FOR WHAT’S NEXT</p>
        <h1 id="welcome-title">Your music.<br /><span>Still becoming.</span></h1>
        <p className="intro">A home for the demos, late-night ideas, and versions worth keeping.</p>
        <div className="panel">
          <span className="symbol" aria-hidden="true">♫</span>
          <div><h2>Your workspace starts here</h2><p>The foundation is ready. Projects, song versions, uploads, and playback are coming in the next milestone.</p></div>
          <span className="phase">Scaffold / 01</span>
        </div>
      </section>
      <footer>UNRELEASED <span>Self-hosted. Yours to build.</span></footer>
    </main>
  );
}
