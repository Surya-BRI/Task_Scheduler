// Mock users for local demo — no backend required
export const MOCK_USERS = [
  {
    id: "hod-1",
    name: "Sarah Mitchell",
    email: "sarah.mitchell@bluerhine.com",
    password: "hod123",
    role: "HOD",
    designation: "Head of Design Department",
    initials: "SM",
  },
  {
    id: "d1",
    name: "Alex Johnson",
    email: "alex.johnson@bluerhine.com",
    password: "alex123",
    role: "DESIGNER",
    designation: "CAD Designer",
    initials: "AJ",
    designerId: "d1",
  },
  {
    id: "d2",
    name: "Alexander Allen",
    email: "alexander.allen@bluerhine.com",
    password: "alex123",
    role: "DESIGNER",
    designation: "Senior Designer",
    initials: "AA",
    designerId: "d2",
  },
  {
    id: "d3",
    name: "Benjamin Harris",
    email: "benjamin.harris@bluerhine.com",
    password: "ben123",
    role: "DESIGNER",
    designation: "UI Designer",
    initials: "BH",
    designerId: "d3",
  },
];

const SESSION_KEY = "br_session";

export function mockLogin(email, password) {
  const user = MOCK_USERS.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );
  if (!user) throw new Error("Invalid email or password.");
  const { password: _pw, ...session } = user;
  if (typeof window !== "undefined") {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
  return session;
}

export function mockLogout() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(SESSION_KEY);
  }
}

export function getSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getHomeRoute(session) {
  if (!session) return "/login";
  if (session.role === "HOD") return "/design-list";
  if (session.role === "DESIGNER") return "/design-list/my-work";
  return "/design-list";
}
