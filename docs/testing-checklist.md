# Zona Time Tracker — Testing Checklist

**Tester:** Pawel  
**Date:** _______________  
**Environment:** https://dev-time.zonaproperties.ae

---

## Before You Start

Use the following accounts during testing:

| Account | Email | Password | Role |
|---|---|---|---|
| Admin | pawel@zonaproperties.ae | ZonaPilot2026! | Administrator |
| Employee | testowy@example.com | TestPilot2026! | Employee |

---

## Admin Testing (Desktop or Laptop)

Log in with the **Admin** account to complete this section.

### Login & Dashboard

- [ ] **1. Login** — Go to https://dev-time.zonaproperties.ae and log in as Admin. Verify you land on the Dashboard.
- [ ] **2. Dashboard overview** — Check that Today at a Glance cards show meaningful numbers. Note any inconsistencies.
- [ ] **3. Live Check-ins** — Verify the table shows currently active sessions (if any).
- [ ] **4. Alerts** — Check the Alerts section. Are any alerts shown? Do they look correct?
- [ ] **5. Dashboard refresh** — Click the Refresh button. Verify the page updates.

### Employees

- [ ] **6. Employee list** — Navigate to Employees. Verify the list loads with names, roles, and statuses.
- [ ] **7. Search employees** — Use the search field to find an employee by name.
- [ ] **8. Open employee record** — Click on an employee to open their detail view.
- [ ] **9. Create a new employee** — Create a test employee (you can deactivate them after). Verify the record appears in the list.
- [ ] **10. Edit an employee** — Change any field (e.g. phone number) and save. Verify the change is reflected.

### Projects

- [ ] **11. Project list** — Navigate to Projects. Verify projects are listed including TEST PROJECT - PILOT.
- [ ] **12. Open a project** — Click on any project to open the detail view.
- [ ] **13. Create a new project** — Create a test project with a name and code. Verify it appears in the list.
- [ ] **14. Edit a project** — Change the project name or status and save. Verify it updates.

### Time Entries

- [ ] **15. Time entries list** — Navigate to Time Entries. Verify entries load.
- [ ] **16. Filter by employee** — Use the employee filter to show only entries for one person.
- [ ] **17. Filter by date** — Change the date range and verify the list updates.
- [ ] **18. Export to Excel** — Click Export and verify a file downloads.

### Extras & Mileage

- [ ] **19. Extras list** — Navigate to Extras. Verify the list loads with statuses.
- [ ] **20. Mileage list** — Navigate to Mileage. Verify entries load.

---

## Employee Testing (iPhone)

Log out from the Admin account. Use the **Employee** account for this section.

### PWA Installation

- [ ] **21. Open in Safari** — Open https://dev-time.zonaproperties.ae in Safari on your iPhone.
- [ ] **22. Log in as Employee** — Log in with testowy@example.com / TestPilot2026!
- [ ] **23. Install to Home Screen** — Use Share → Add to Home Screen. Verify the icon appears.
- [ ] **24. Launch from icon** — Close Safari, tap the Home Screen icon. Verify it opens in full-screen mode.

### Employee Functions

- [ ] **25. Check In** — Tap Check In, select TEST PROJECT - PILOT, and confirm. Verify the session starts.
- [ ] **26. Dashboard update** — Switch to the Admin account (on a desktop) and verify the employee appears in Live Check-ins.
- [ ] **27. Check Out** — On the employee device, tap Check Out. Verify the session ends.
- [ ] **28. My Time** — Tap My Time. Verify the completed session appears.
- [ ] **29. Add Extra** — Submit an Extra Work item with a description. Verify it appears in My Time / Extras.
- [ ] **30. Add Mileage** — Submit a mileage entry with a distance. Verify it saves.

---

## Overall Impressions

### What worked well?

_______________________________________________
_______________________________________________

### What was confusing or unclear?

_______________________________________________
_______________________________________________

### What is missing?

_______________________________________________
_______________________________________________

### Priority issues (blocking for production):

_______________________________________________
_______________________________________________

### Comments / Suggestions

_______________________________________________
_______________________________________________
_______________________________________________
_______________________________________________
_______________________________________________

---

**Testing completed:** ☐ Yes  
**Signed:** _______________  **Date:** _______________
