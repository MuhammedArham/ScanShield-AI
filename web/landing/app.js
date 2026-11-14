'use strict';
const $ = id => document.getElementById(id);
const setup = $('setup');
const nameField = $('first-name'), mobileField = $('mobile');
let dialogSession = 0;
function clearError(field, id) { field.removeAttribute('aria-invalid'); $(id).hidden = true; $(id).textContent = ''; }
function clearContact() {
  $('contact-form').reset(); $('agreement-form').reset();
  $('review-name').textContent = ''; $('review-initial').textContent = '';
  $('picker-status').textContent = ''; $('picker-status').hidden = true;
  clearError(nameField, 'name-error'); clearError(mobileField, 'mobile-error');
}
function showStep(step) {
  $('setup-one').hidden = step !== 1; $('setup-two').hidden = step !== 2; $('setup-done').hidden = step !== 3;
  $('setup-progress').textContent = step === 3 ? 'Prototype complete' : 'Step ' + step + ' of 2';
  $('setup-title').textContent = step === 1 ? 'Who would you ask for help?' : step === 2 ? 'Your trusted person.' : 'You’ve tried the setup.';
  $('setup-title').focus();
}
document.querySelectorAll('[data-setup]').forEach(button => button.addEventListener('click', () => {
  dialogSession++; clearContact(); showStep(1); setup.showModal(); $('setup-title').focus();
}));
$('close-setup').addEventListener('click', () => setup.close());
$('done').addEventListener('click', () => setup.close());
setup.addEventListener('close', () => { dialogSession++; clearContact(); });
function showError(field, id, message) { field.setAttribute('aria-invalid', 'true'); $(id).textContent = message; $(id).hidden = false; }
nameField.addEventListener('input', () => clearError(nameField, 'name-error'));
mobileField.addEventListener('input', () => clearError(mobileField, 'mobile-error'));
$('contact-form').addEventListener('submit', event => {
  event.preventDefault(); clearError(nameField, 'name-error'); clearError(mobileField, 'mobile-error');
  const name = nameField.value.trim(), digits = mobileField.value.replace(/\D/g, '');
  const validName = name.length > 0;
  const validMobile = digits.length >= 7 && digits.length <= 15 && /^[+\d\s().-]+$/.test(mobileField.value);
  if (!validName) showError(nameField, 'name-error', 'Enter their first name.');
  if (!validMobile) showError(mobileField, 'mobile-error', 'Enter a mobile number with 7 to 15 digits.');
  if (!validName || !validMobile) { (validName ? mobileField : nameField).focus(); return; }
  $('review-name').textContent = name;
  $('review-initial').textContent = Array.from(name)[0].toUpperCase();
  $('agree').checked = false; showStep(2);
});
$('back').addEventListener('click', () => showStep(1));
$('agreement-form').addEventListener('submit', event => {
  event.preventDefault(); if (!$('agree').checked) return;
  clearContact(); showStep(3);
});
if (window.isSecureContext && 'contacts' in navigator && typeof navigator.contacts.select === 'function') {
  $('pick-contact').hidden = false;
  $('pick-contact').addEventListener('click', async () => {
    const session = dialogSession;
    try {
      const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: false });
      if (!setup.open || session !== dialogSession) return;
      if (contacts.length) {
        nameField.value = (contacts[0].name?.[0] || '').trim().split(/\s+/)[0].slice(0, 40);
        mobileField.value = (contacts[0].tel?.[0] || '').slice(0, 25);
        clearError(nameField, 'name-error'); clearError(mobileField, 'mobile-error');
        $('picker-status').textContent = 'Check the selected details before continuing.';
        $('picker-status').hidden = false;
      }
    } catch (error) {
      if (!setup.open || session !== dialogSession) return;
      $('picker-status').textContent = error.name === 'AbortError' ? 'No contact selected. You can enter their details below.' : 'Contact selection is unavailable here. Enter their details below.';
      $('picker-status').hidden = false;
    }
  });
}
