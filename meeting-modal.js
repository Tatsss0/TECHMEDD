(function(){
    const MODAL_ID = 'meetingModal';
    const IFRAME_ID = 'meetingFrame';
  
    function ensureModal(){
      if (document.getElementById(MODAL_ID)) return;
  
      const tpl = document.createElement('div');
      tpl.innerHTML = `
  <div class="modal fade" id="${MODAL_ID}" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-fullscreen">
      <div class="modal-content bg-dark">
        <div class="modal-header border-0 text-bg-dark">
          <h5 class="modal-title">Video Visit</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-0">
          <iframe id="${IFRAME_ID}" src="about:blank" style="border:0;width:100%;height:100%" allow="camera; microphone; display-capture;" referrerpolicy="no-referrer"></iframe>
        </div>
      </div>
    </div>
  </div>`;
      document.body.appendChild(tpl.firstElementChild);
    }
  
    function openMeeting(url){
      ensureModal();
      const frame = document.getElementById(IFRAME_ID);
      const full = addParam(url, 'embed', '1');
      frame.src = full;
  
      const modalEl = document.getElementById(MODAL_ID);
      const modal = bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: 'static' });
      modal.show();
  
      const onHidden = () => {
        frame.src = 'about:blank';
        modalEl.removeEventListener('hidden.bs.modal', onHidden);
        try { frame.contentWindow?.postMessage({ type: 'hangup' }, '*'); } catch(_) {}
      };
      modalEl.addEventListener('hidden.bs.modal', onHidden);
    }
  
    function addParam(url, key, value){
      try {
        const u = new URL(url, window.location.origin);
        u.searchParams.set(key, value);
        return u.toString();
      } catch { return url; }
    }
  
    function interceptLinks(){
      document.addEventListener('click', (e)=>{
        const a = e.target.closest('a');
        if (!a) return;
        const href = a.getAttribute('href') || '';
        if (!href) return;
        // Only intercept links that target our meeting page
        const isMeeting = href.startsWith('./index.html') || href.startsWith('index.html');
        if (!isMeeting) return;
  
        e.preventDefault();
        const url = new URL(href, window.location.href).toString();
        openMeeting(url);
      }, true);
    }
  
    // Expose small API and auto-wire
    window.TechmedMeeting = { open: openMeeting };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', interceptLinks);
    } else {
      interceptLinks();
    }
  })();