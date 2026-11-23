#!/usr/bin/env bash
#
# Stiahne odber rozvrhu z EduPage a pošle ho appke na /api/rozvrh.
#
# PREČO TO BEŽÍ DOMA
#
# EduPage od novembra 2026 zahadzuje spojenia zo serverov v dátových
# centrách: Vercel (AWS) aj GitHub Actions (Azure) skončia časovým limitom
# ešte pri pripájaní (`UND_ERR_CONNECT_TIMEOUT`, `curl` kód 28). Z bežnej
# siete sa odber stiahne za desatinu sekundy. Appka preto odber prijme
# v tele požiadavky (`zdrojOdberu` v src/lib/ics.ts) a k EduPage sa vôbec
# nepripája — sťahuje tento skript na domácom serveri.
#
# NASTAVENIE
#
# Súbor s tromi riadkami, čitateľný len pre teba (chmod 600):
#
#   SKOLA_ICS_URL=https://…edupage.org/…      (aj webcal://)
#   ROZVRH_URL=https://tvoja-adresa.vercel.app/api/rozvrh
#   CRON_SECRET=to isté tajomstvo, aké je na Verceli
#
# Predvolene ~/.config/rozvrh/nastavenie, iná cesta ide ako prvý argument.
# Je to obyčajné KEY=hodnota, nie shell — hodnoty sa nespúšťajú.
#
# SPUSTENIE
#
#   scripts/rozvrh-zo-servera.sh [cesta-k-nastaveniu]
#
# Návod na cron je v docs/NASADENIE.md, sekcia 7.
#
# Adresa odberu je prístup k rozvrhu: skript ju nikdy nevypíše, ani
# v chybe curlu (z tej ide von len číselný kód).

set -euo pipefail

nastavenie="${1:-${XDG_CONFIG_HOME:-$HOME/.config}/rozvrh/nastavenie}"

chyba() {
  echo "rozvrh: $*" >&2
  exit 1
}

[ -r "$nastavenie" ] || chyba "nenašiel som nastavenie $nastavenie (návod je v hlavičke skriptu)"

# Súbor nesie tajomstvo — keď ho vidia aj iní, nech to aspoň vieš.
if [ -n "$(find "$nastavenie" -perm /077 2>/dev/null)" ]; then
  echo "rozvrh: varovanie — $nastavenie môžu čítať aj iní, spusti: chmod 600 \"$nastavenie\"" >&2
fi

# KEY=hodnota bez spúšťania. Úvodzovky okolo hodnoty sa zhodia,
# medzery na konci riadku (aj \r z Windowsu) tiež.
hodnota() {
  local riadok
  riadok=$(grep -E "^[[:space:]]*$1[[:space:]]*=" "$nastavenie" | tail -n1 || true)
  riadok="${riadok#*=}"
  riadok=$(printf '%s' "$riadok" | tr -d '\r' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/')
  printf '%s' "$riadok"
}

odber=$(hodnota SKOLA_ICS_URL)
url=$(hodnota ROZVRH_URL)
secret=$(hodnota CRON_SECRET)

[ -n "$odber" ] || chyba "v nastavení chýba SKOLA_ICS_URL"
[ -n "$url" ] || chyba "v nastavení chýba ROZVRH_URL"
[ -n "$secret" ] || chyba "v nastavení chýba CRON_SECRET"

# Webcal je len iné meno pre https — curl ho nepozná.
adresa=$(printf '%s' "$odber" | tr -d '[:space:]' | sed -E 's#^[Ww][Ee][Bb][Cc][Aa][Ll]://#https://#')

docasny=$(mktemp -d)
trap 'rm -rf "$docasny"' EXIT
subor="$docasny/rozvrh.ics"

kod_curl=0
stav=$(curl -s -o "$subor" -w "%{http_code}" \
  -H "Accept: text/calendar, text/plain" \
  --connect-timeout 20 --max-time 60 \
  --retry 2 --retry-delay 5 --retry-connrefused \
  "$adresa") || kod_curl=$?

if [ "$kod_curl" != "0" ]; then
  chyba "k odberu EduPage sa nepodarilo pripojiť (curl kód $kod_curl; 28 = časový limit, 7 = spojenie odmietnuté, 6 = neznáma adresa)"
fi
[ "$stav" = "200" ] || chyba "odber EduPage odpovedal $stav — skontroluj, či adresa Webcal v EduPage stále platí"

# Prvý neprázdny riadok (bez BOM) musí byť BEGIN:VCALENDAR — HTML stránka
# s prihlásením by sa inak tvárila ako prázdny rozvrh. Bez `grep -m1`
# a podobných: pri `pipefail` by predčasný koniec rúry zhodil skript aj na
# správnom kalendári.
prvy=$(head -c 500 "$subor" | LC_ALL=C sed -e '1s/^\xEF\xBB\xBF//' -e 's/\r$//' | awk 'NF && !n { print; n = 1 }' | tr '[:lower:]' '[:upper:]')
case "$prvy" in
  *BEGIN:VCALENDAR*) ;;
  *) chyba "z odberu EduPage neprišiel kalendár (začiatok: $(head -c 20 "$subor" | tr -cd '[:alnum:] <>!_-'))" ;;
esac

# Tajomstvo ide cez súbor s hlavičkou, nie na príkazový riadok — tam by ho
# videl každý, kto sa pozrie do `ps`.
hlavicka="$docasny/hlavicka"
( umask 077; printf 'Authorization: Bearer %s\n' "$secret" > "$hlavicka" )

kod_curl=0
odpoved=$(curl -sS -X POST "$url" \
  -H "@$hlavicka" \
  -H "Content-Type: text/calendar; charset=utf-8" \
  --data-binary "@$subor" \
  -w "\n%{http_code}" \
  --max-time 90) || kod_curl=$?

[ "$kod_curl" = "0" ] || chyba "appka neodpovedala (curl kód $kod_curl)"

kod=$(printf '%s' "$odpoved" | tail -n1)
telo=$(printf '%s' "$odpoved" | sed '$d')

case "$kod" in
  200) echo "rozvrh: $(wc -c < "$subor" | tr -d ' ') bajtov z EduPage → appka: $telo" ;;
  401) chyba "appka odmietla tajomstvo (401) — CRON_SECRET sa nezhoduje s Vercelom" ;;
  409) echo "rozvrh: rozvrh má viac používateľov, appka nevie komu ho dať (409): $telo" >&2 ;;
  *) chyba "appka vrátila $kod: $telo" ;;
esac
