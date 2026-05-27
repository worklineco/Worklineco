const LOGIN_ID = "DCO";
const LOGIN_PASSWORD = "14331433";
const MAX_DURATION_MINUTES = 120;
const STORAGE_KEY = "meetingRoomBookings";

const rooms = [
  { name: "Manthan", floor: "3rd Floor" },
  { name: "Darshan", floor: "2nd Floor" },
  { name: "Jnan", floor: "2nd Floor" },
  { name: "Charitra", floor: "2nd Floor" },
  { name: "Setu", floor: "1st Floor" },
  { name: "Samvad", floor: "1st Floor" }
];

const teams = [
  "Team 01 - Gargi Paliwal",
  "Team 03",
  "Team 04 - Shefali Bang",
  "Team 05 - Dheera Khatri",
  "Team 06 - Sourabh Chippa",
  "Team 07 - Romil Nagori",
  "Team 08 - Shradha Sareen",
  "Team 09 - Naresh Sharma",
  "Team 10 - Pooja Jain",
  "Team 12 - Ayush Dusad",
  "Mr. Arvind Dhadda",
  "Mr. Yash Dhadda",
  "Mrs. Princy Dhadda",
  "Mr. Mudit Jain",
  "Mrs. Shuchi Sethi"
];

const loginScreen = document.querySelector("#loginScreen");
const loginForm = document.querySelector("#loginForm");
const loginMessage = document.querySelector("#loginMessage");
const appShell = document.querySelector("#appShell");
const logoutButton = document.querySelector("#logoutButton");
const bookingForm = document.querySelector("#bookingForm");
const roomGrid = document.querySelector("#roomGrid");
const formMessage = document.querySelector("#formMessage");
const liveClock = document.querySelector("#liveClock");
const todayLabel = document.querySelector("#todayLabel");
const roomCardTemplate = document.querySelector("#roomCardTemplate");
const floorTabs = document.querySelectorAll(".floor-tab");
const bookingDate = document.querySelector("#bookingDate");
const boardDate = document.querySelector("#boardDate");
const teamName = document.querySelector("#teamName");
const formTitle = document.querySelector("#formTitle");
const submitButton = document.querySelector("#submitButton");
const cancelEditButton = document.querySelector("#cancelEditButton");
const scheduleTitle = document.querySelector("#scheduleTitle");
const clockSelects = {
  fromHour: document.querySelector("#fromHour"),
  fromMinute: document.querySelector("#fromMinute"),
  fromMeridiem: document.querySelector("#fromMeridiem"),
  toHour: document.querySelector("#toHour"),
  toMinute: document.querySelector("#toMinute"),
  toMeridiem: document.querySelector("#toMeridiem")
};

let activeFloor = "All";
let editingBookingId = null;
let bookings = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

function toDateValue(date) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function saveBookings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
}

function formatDate(dateValue) {
  return new Date(`${dateValue}T00:00:00`).toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short"
  });
}

function formatTime(time) {
  const [hour, minute] = time.split(":");
  const date = new Date();
  date.setHours(Number(hour), Number(minute));
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

function minutesFromTime(time) {
  const [hour, minute] = time.split(":").map(Number);
  return (hour * 60) + minute;
}

function composeTime(prefix) {
  const hour = Number(clockSelects[`${prefix}Hour`].value);
  const minute = clockSelects[`${prefix}Minute`].value;
  const meridiem = clockSelects[`${prefix}Meridiem`].value;
  const hour24 = meridiem === "AM"
    ? (hour === 12 ? 0 : hour)
    : (hour === 12 ? 12 : hour + 12);

  return `${String(hour24).padStart(2, "0")}:${minute}`;
}

function splitTime(time, prefix) {
  const [hourText, minute] = time.split(":");
  const hour24 = Number(hourText);
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  clockSelects[`${prefix}Hour`].value = String(hour12);
  clockSelects[`${prefix}Minute`].value = minute;
  clockSelects[`${prefix}Meridiem`].value = meridiem;
}

function setMessage(message, type = "error") {
  formMessage.textContent = message;
  formMessage.classList.toggle("success", type === "success");
}

function setLoginMessage(message) {
  loginMessage.textContent = message;
}

function fillTeamOptions() {
  teams.forEach((team) => {
    const option = document.createElement("option");
    option.value = team;
    option.textContent = team;
    teamName.append(option);
  });
}

function fillClockOptions() {
  ["fromHour", "toHour"].forEach((key) => {
    for (let hour = 1; hour <= 12; hour += 1) {
      const option = document.createElement("option");
      option.value = String(hour);
      option.textContent = String(hour);
      clockSelects[key].append(option);
    }
  });

  ["fromMinute", "toMinute"].forEach((key) => {
    for (let minute = 0; minute < 60; minute += 5) {
      const option = document.createElement("option");
      option.value = String(minute).padStart(2, "0");
      option.textContent = String(minute).padStart(2, "0");
      clockSelects[key].append(option);
    }
  });

  setDefaultClock();
}

function setDefaultClock() {
  clockSelects.fromHour.value = "10";
  clockSelects.fromMinute.value = "00";
  clockSelects.fromMeridiem.value = "AM";
  clockSelects.toHour.value = "11";
  clockSelects.toMinute.value = "00";
  clockSelects.toMeridiem.value = "AM";
}

function setDateLimits() {
  const today = toDateValue(new Date());
  const maxDate = toDateValue(addDays(new Date(), 6));
  [bookingDate, boardDate].forEach((input) => {
    input.min = today;
    input.max = maxDate;
    input.value = today;
  });
}

function bookingOverlaps(newBooking) {
  return bookings.some((booking) => {
    return booking.id !== editingBookingId
      && booking.date === newBooking.date
      && booking.roomName === newBooking.roomName
      && newBooking.fromTime < booking.toTime
      && newBooking.toTime > booking.fromTime;
  });
}

function createActionButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function resetForm() {
  editingBookingId = null;
  bookingForm.reset();
  bookingDate.value = boardDate.value;
  setDefaultClock();
  formTitle.textContent = "Book a Room";
  submitButton.textContent = "Add Booking";
  cancelEditButton.classList.add("is-hidden");
}

function startEdit(booking) {
  editingBookingId = booking.id;
  bookingDate.value = booking.date;
  boardDate.value = booking.date;
  document.querySelector("#roomName").value = booking.roomName;
  splitTime(booking.fromTime, "from");
  splitTime(booking.toTime, "to");
  teamName.value = booking.teamName;
  document.querySelector("#purpose").value = booking.purpose;
  formTitle.textContent = "Edit Booking";
  submitButton.textContent = "Save Changes";
  cancelEditButton.classList.remove("is-hidden");
  setMessage("Editing selected booking.", "success");
  renderRooms();
}

function deleteBooking(id) {
  const booking = bookings.find((item) => item.id === id);
  bookings = bookings.filter((item) => item.id !== id);
  saveBookings();
  if (editingBookingId === id) {
    resetForm();
  }
  renderRooms();
  setMessage(`${booking?.roomName || "Booking"} deleted.`, "success");
}

function renderRooms() {
  roomGrid.innerHTML = "";
  scheduleTitle.textContent = `${formatDate(boardDate.value)} Bookings`;

  rooms
    .filter((room) => activeFloor === "All" || room.floor === activeFloor)
    .forEach((room) => {
      const card = roomCardTemplate.content.firstElementChild.cloneNode(true);
      const roomBookings = bookings
        .filter((booking) => booking.date === boardDate.value && booking.roomName === room.name)
        .sort((a, b) => a.fromTime.localeCompare(b.fromTime));

      card.querySelector("h3").textContent = room.name;
      card.querySelector(".floor-label").textContent = room.floor;

      const status = card.querySelector(".room-status");
      status.textContent = roomBookings.length ? `${roomBookings.length} booked` : "Available";
      status.classList.toggle("busy", roomBookings.length > 0);

      const list = card.querySelector(".booking-list");
      if (!roomBookings.length) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No bookings for this date.";
        list.append(empty);
      }

      roomBookings.forEach((booking) => {
        const item = document.createElement("div");
        item.className = "booking-item";
        item.classList.toggle("editing", booking.id === editingBookingId);

        const time = document.createElement("strong");
        const team = document.createElement("span");
        const purpose = document.createElement("span");
        const actions = document.createElement("div");

        actions.className = "booking-actions";
        time.textContent = `${formatTime(booking.fromTime)} - ${formatTime(booking.toTime)}`;
        team.textContent = booking.teamName;
        purpose.textContent = booking.purpose;
        actions.append(
          createActionButton("Edit", "mini-button edit", () => startEdit(booking)),
          createActionButton("Delete", "mini-button delete", () => deleteBooking(booking.id))
        );

        item.append(time, team, purpose, actions);
        list.append(item);
      });

      roomGrid.append(card);
    });
}

function updateClock() {
  const now = new Date();
  liveClock.textContent = now.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
  todayLabel.textContent = now.toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "short"
  });
}

function showApp() {
  loginScreen.classList.add("is-hidden");
  appShell.classList.remove("is-hidden");
}

function showLogin() {
  loginScreen.classList.remove("is-hidden");
  appShell.classList.add("is-hidden");
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const enteredId = document.querySelector("#loginId").value.trim();
  const enteredPassword = document.querySelector("#loginPassword").value;

  if (enteredId === LOGIN_ID && enteredPassword === LOGIN_PASSWORD) {
    sessionStorage.setItem("dcoLoggedIn", "true");
    loginForm.reset();
    setLoginMessage("");
    showApp();
    return;
  }

  setLoginMessage("Invalid login ID or password.");
});

logoutButton.addEventListener("click", () => {
  sessionStorage.removeItem("dcoLoggedIn");
  showLogin();
});

bookingForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const roomSelect = document.querySelector("#roomName");
  const newBooking = {
    id: editingBookingId || crypto.randomUUID(),
    date: bookingDate.value,
    roomName: roomSelect.value,
    floor: roomSelect.selectedOptions[0]?.dataset.floor,
    fromTime: composeTime("from"),
    toTime: composeTime("to"),
    teamName: teamName.value,
    purpose: document.querySelector("#purpose").value.trim()
  };

  const duration = minutesFromTime(newBooking.toTime) - minutesFromTime(newBooking.fromTime);

  if (duration <= 0) {
    setMessage("Please choose a To time after the From time.");
    return;
  }

  if (duration > MAX_DURATION_MINUTES) {
    setMessage("Maximum booking slot is 2 hours.");
    return;
  }

  if (bookingOverlaps(newBooking)) {
    setMessage(`${newBooking.roomName} already has a booking during this time.`);
    return;
  }

  if (editingBookingId) {
    bookings = bookings.map((booking) => booking.id === editingBookingId ? newBooking : booking);
    setMessage("Booking updated successfully.", "success");
  } else {
    bookings = [...bookings, newBooking];
    setMessage("Booking added successfully.", "success");
  }

  boardDate.value = newBooking.date;
  saveBookings();
  resetForm();
  renderRooms();
});

cancelEditButton.addEventListener("click", () => {
  resetForm();
  setMessage("Edit cancelled.", "success");
  renderRooms();
});

boardDate.addEventListener("change", () => {
  if (!editingBookingId) {
    bookingDate.value = boardDate.value;
  }
  renderRooms();
});

bookingDate.addEventListener("change", () => {
  boardDate.value = bookingDate.value;
  renderRooms();
});

floorTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activeFloor = tab.dataset.floor;
    floorTabs.forEach((button) => button.classList.toggle("active", button === tab));
    renderRooms();
  });
});

fillTeamOptions();
fillClockOptions();
setDateLimits();
updateClock();
renderRooms();
setInterval(updateClock, 1000);

if (sessionStorage.getItem("dcoLoggedIn") === "true") {
  showApp();
} else {
  showLogin();
}
