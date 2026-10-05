/* คู่มือระบบอบรม — /training/?page=manual (หน้าตาอยู่ใน <template id="trn-page-manual"> ของ training/index.html) */
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        navLinks.forEach(l => l.classList.remove('active'));
        const active = document.querySelector(`.nav-link[href="#${e.target.id}"]`);
        if (active) active.classList.add('active');
      }
    });
  }, { rootMargin: '-20% 0px -75% 0px' });
  sections.forEach(s => obs.observe(s));
