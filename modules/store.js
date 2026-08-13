// @ts-check

import { DEFAULT_SETTINGS } from "../shared/constants.js";

export const store = {
  devices: [],
  categories: [],
  settings: DEFAULT_SETTINGS,
  authRequired: false,
  adminPassword: sessionStorage.getItem("adminPassword") || ""
};

export const setAdminPassword = (value) => {
  store.adminPassword = value;
  if (value) sessionStorage.setItem("adminPassword", value);
  else sessionStorage.removeItem("adminPassword");
  localStorage.removeItem("adminPassword");
};
