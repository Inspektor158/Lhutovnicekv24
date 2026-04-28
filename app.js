const cj = document.getElementById('cj');
const nazev = document.getElementById('nazev');

cj.addEventListener("input", e => e.target.value = e.target.value.toUpperCase());
nazev.addEventListener("input", e => e.target.value = e.target.value.toUpperCase());
