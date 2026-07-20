# Zona Time Tracker — Przewodnik Szybkiego Startu

**Wersja:** Sprint 5.3 (Czerwiec 2026)  
**Odbiorcy:** Wszyscy użytkownicy — Administrator, Menedżer, Pracownik

---

## 1. Logowanie

Otwórz przeglądarkę i przejdź pod adres:

**https://dev-time.zonaproperties.ae**

Wpisz swój adres e-mail i hasło, a następnie kliknij **Zaloguj się**.

> Jeśli zapomniałeś hasła, kliknij **Nie pamiętam hasła** na ekranie logowania i postępuj zgodnie z instrukcjami wysłanymi na Twój adres e-mail.

---

## 2. Panel Główny (Administrator / Menedżer)

Po zalogowaniu jako Administrator lub Menedżer trafiasz do **Panelu Operacyjnego**.

Pokazuje on bieżący przegląd aktywności na dziś:

| Sekcja | Co pokazuje |
|---|---|
| **Dzień w skrócie** | Aktywni teraz · Wymeldowani dziś · Brak aktywności · Przepracowane godziny · Otwarte ekstra |
| **Alerty** | Sesje powyżej 10 godzin · Otwarte sesje z poprzedniego dnia · Pracownicy bez aktywności |
| **Aktywne zameldowania** | Kto jest aktualnie zameldowany, na jakim projekcie, od kiedy |
| **Projekty na dziś** | Zestawienie aktywności według projektów |
| **Status pracowników** | Status każdego pracownika (Zameldowany / Wymeldowany / Brak aktywności) |
| **Otwarte ekstra** | Oczekujące ekstra do rozpatrzenia |

Panel odświeża się automatycznie co 30 sekund. Użyj przycisku **Odśwież**, aby zaktualizować natychmiast.

---

## 3. Pracownicy

Przejdź do **Pracownicy** w górnym menu.

- Przeglądaj wszystkich pracowników: imię, numer, rola, status, zespół
- Wyszukaj według imienia lub numeru pracownika
- Filtruj według roli, zespołu lub statusu
- Otwórz kartę pracownika, aby zobaczyć szczegóły, edytować dane, zarządzać przypisaniami

**Statusy pracowników:**
- **Aktywny** — może się logować i korzystać z systemu
- **Oczekujący** — zaproszenie wysłane, jeszcze nie przyjęte
- **Nieaktywny** — konto wyłączone

---

## 4. Projekty

Przejdź do **Projekty** w górnym menu.

- Przeglądaj wszystkie projekty: nazwa, kod, klient, status
- Utwórz nowy projekt: nazwa, kod, klient, lokalizacja, data rozpoczęcia
- Przypisz pracowników do projektu (ograniczony dostęp) lub pozostaw otwarty (wszyscy pracownicy mogą uzyskać dostęp)
- Projekty o statusie **Aktywny** pojawiają się na liście wyboru przy zameldowaniu

---

## 5. Wpisy Czasu

Przejdź do **Wpisy czasu** w górnym menu.

Przeglądaj i filtruj wszystkie wpisy czasu w organizacji:

- Filtruj według pracownika, projektu, zakresu dat lub źródła wpisu
- Sprawdź czasy zameldowania i wymeldowania, status GPS, czas trwania
- Przeglądaj ręczne wpisy (wprowadzone wstecznie przez administratora)
- Pobierz wpisy jako plik Excel

---

## 6. Ekstra

Przejdź do **Ekstra** w górnym menu.

Ekstra to pozycje inne niż czas pracy, składane przez pracowników do zatwierdzenia:

- **Dodatkowa praca** — dodatkowe godziny pracy poza zakresem projektu
- **Koszt własny** — wydatki osobiste do zwrotu

Każde ekstra ma status: **Otwarte** (oczekuje na rozpatrzenie) lub **Zamknięte** (przetworzone).

---

## 7. Kilometry

Przejdź do **Kilometry** w górnym menu.

Pracownicy składają raporty przejechanych kilometrów służbowych. Administratorzy mogą przeglądać wszystkie kilometry, filtrować według pracownika lub tygodnia oraz eksportować dane.

---

## 8. Role użytkowników

| Rola | Uprawnienia |
|---|---|
| **Administrator** | Pełny dostęp — pracownicy, projekty, wpisy czasu, ekstra, kilometry, panel, ustawienia |
| **Menedżer** | Ograniczony widok — widzi tylko pracowników i projekty przypisane do jego zespołów |
| **Pracownik** | Dostęp tylko mobilny — zameldowanie/wymeldowanie, ekstra, kilometry, widok własnego czasu |

---

## 9. Co jest już dostępne

- ✅ Logowanie / wylogowanie / reset hasła
- ✅ Panel Operacyjny (aktywne zameldowania, alerty, projekty, status pracowników)
- ✅ Zarządzanie pracownikami (tworzenie, edycja, zapraszanie, dezaktywacja, reaktywacja)
- ✅ Zarządzanie projektami (tworzenie, edycja, przypisywanie pracowników, dezaktywacja)
- ✅ Wpisy czasu (przeglądanie, filtrowanie, eksport Excel)
- ✅ Zameldowanie / Wymeldowanie (mobilna aplikacja pracownika z GPS)
- ✅ Ekstra (składanie, przeglądanie, zamykanie)
- ✅ Kilometry (składanie, przeglądanie, eksport)
- ✅ Instalacja PWA (dodaj do ekranu głównego iPhone'a)
- ✅ Dostęp oparty na rolach (Administrator, Menedżer, Pracownik)
- ✅ Dziennik audytu (wszystkie zmiany są rejestrowane)
- ✅ Automatyczne wykrywanie niezamkniętych sesji

---

## 10. Co NIE jest jeszcze dostępne

- ❌ Powiadomienia e-mail (wymagana konfiguracja usługi e-mail)
- ❌ Interfejs przypisywania zespołów do menedżerów (obecnie przez bazę danych)
- ❌ Ekran zarządzania klientami
- ❌ Raporty i eksport fakturowania
- ❌ Integracja z listą płac
- ❌ Workflow zatwierdzania ekstra
- ❌ Obsługa wielu języków
- ❌ Tryb offline dla aplikacji mobilnej

---

*W razie pytań skontaktuj się z administratorem systemu.*
