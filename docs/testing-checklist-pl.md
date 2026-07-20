# Zona Time Tracker — Lista Kontrolna Testowania

**Tester:** Pawel  
**Data:** _______________  
**Środowisko:** https://dev-time.zonaproperties.ae

---

## Przed rozpoczęciem

Podczas testowania używaj następujących kont:

| Konto | E-mail | Hasło | Rola |
|---|---|---|---|
| Administrator | pawel@zonaproperties.ae | ZonaPilot2026! | Administrator |
| Pracownik | testowy@example.com | TestPilot2026! | Pracownik |

---

## Testy administratora (komputer lub laptop)

Zaloguj się na konto **Administratora**, aby wykonać tę część.

### Logowanie i Panel

- [ ] **1. Logowanie** — Przejdź pod adres https://dev-time.zonaproperties.ae i zaloguj się jako Administrator. Sprawdź, czy trafisz na Panel główny.
- [ ] **2. Przegląd panelu** — Sprawdź, czy karty „Dzień w skrócie" wyświetlają sensowne dane. Zanotuj wszelkie niezgodności.
- [ ] **3. Aktywne zameldowania** — Sprawdź, czy tabela pokazuje aktywne sesje (jeśli istnieją).
- [ ] **4. Alerty** — Przejrzyj sekcję Alerty. Czy są wyświetlane jakieś alerty? Czy wyglądają prawidłowo?
- [ ] **5. Odświeżanie panelu** — Kliknij przycisk Odśwież. Sprawdź, czy strona się aktualizuje.

### Pracownicy

- [ ] **6. Lista pracowników** — Przejdź do Pracownicy. Sprawdź, czy lista ładuje się z nazwiskami, rolami i statusami.
- [ ] **7. Wyszukiwanie pracowników** — Użyj pola wyszukiwania, aby znaleźć pracownika według nazwiska.
- [ ] **8. Otwieranie karty pracownika** — Kliknij pracownika, aby otworzyć widok szczegółowy.
- [ ] **9. Dodawanie pracownika** — Utwórz testowego pracownika (możesz go dezaktywować po teście). Sprawdź, czy pojawia się na liście.
- [ ] **10. Edycja pracownika** — Zmień dowolne pole (np. numer telefonu) i zapisz. Sprawdź, czy zmiana jest widoczna.

### Projekty

- [ ] **11. Lista projektów** — Przejdź do Projekty. Sprawdź, czy projekty są wyświetlone, w tym TEST PROJECT - PILOT.
- [ ] **12. Otwieranie projektu** — Kliknij dowolny projekt, aby otworzyć widok szczegółowy.
- [ ] **13. Tworzenie projektu** — Utwórz testowy projekt z nazwą i kodem. Sprawdź, czy pojawia się na liście.
- [ ] **14. Edycja projektu** — Zmień nazwę lub status projektu i zapisz. Sprawdź, czy aktualizacja jest widoczna.

### Wpisy czasu

- [ ] **15. Lista wpisów czasu** — Przejdź do Wpisy czasu. Sprawdź, czy wpisy się ładują.
- [ ] **16. Filtrowanie według pracownika** — Użyj filtra pracownika, aby wyświetlić wpisy tylko jednej osoby.
- [ ] **17. Filtrowanie według daty** — Zmień zakres dat i sprawdź, czy lista się aktualizuje.
- [ ] **18. Eksport do Excela** — Kliknij Eksportuj i sprawdź, czy plik się pobiera.

### Ekstra i Kilometry

- [ ] **19. Lista ekstra** — Przejdź do Ekstra. Sprawdź, czy lista ładuje się ze statusami.
- [ ] **20. Lista kilometrów** — Przejdź do Kilometry. Sprawdź, czy wpisy się ładują.

---

## Testy pracownika (iPhone)

Wyloguj się z konta Administratora. Użyj konta **Pracownika** do tej części.

### Instalacja PWA

- [ ] **21. Otwórz w Safari** — Otwórz https://dev-time.zonaproperties.ae w Safari na iPhonie.
- [ ] **22. Zaloguj się jako Pracownik** — Zaloguj się na testowy@example.com / TestPilot2026!
- [ ] **23. Zainstaluj na ekranie głównym** — Użyj Udostępnij → Dodaj do ekranu głównego. Sprawdź, czy ikona się pojawi.
- [ ] **24. Uruchom z ikony** — Zamknij Safari, dotknij ikony na ekranie głównym. Sprawdź, czy aplikacja otwiera się w trybie pełnoekranowym.

### Funkcje pracownika

- [ ] **25. Zameldowanie** — Dotknij Zamelduj się, wybierz TEST PROJECT - PILOT i potwierdź. Sprawdź, czy sesja się rozpoczęła.
- [ ] **26. Aktualizacja panelu** — Przełącz na konto Administratora (na komputerze) i sprawdź, czy pracownik pojawia się w Aktywnych zameldowaniach.
- [ ] **27. Wymeldowanie** — Na urządzeniu pracownika dotknij Wymelduj się. Sprawdź, czy sesja się zakończyła.
- [ ] **28. Mój czas** — Dotknij Mój czas. Sprawdź, czy ukończona sesja jest widoczna.
- [ ] **29. Dodaj ekstra** — Zgłoś pozycję Dodatkowa praca z opisem. Sprawdź, czy pojawia się w Mój czas / Ekstra.
- [ ] **30. Dodaj kilometry** — Zgłoś wpis z odległością. Sprawdź, czy zapis się pojawia.

---

## Ogólne wrażenia

### Co działało dobrze?

_______________________________________________
_______________________________________________

### Co było mylące lub niejasne?

_______________________________________________
_______________________________________________

### Czego brakuje?

_______________________________________________
_______________________________________________

### Problemy priorytetowe (blokujące wdrożenie produkcyjne):

_______________________________________________
_______________________________________________

### Komentarze / Sugestie

_______________________________________________
_______________________________________________
_______________________________________________
_______________________________________________
_______________________________________________

---

**Testowanie zakończone:** ☐ Tak  
**Podpis:** _______________  **Data:** _______________
