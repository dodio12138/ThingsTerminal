// @ts-check

export const store = {
  devices: [],
  categories: [],
  authRequired: false,
  adminPassword: localStorage.getItem("adminPassword") || ""
};

export const setAdminPassword = (value) => {
  store.adminPassword = value;
  localStorage.setItem("adminPassword", value);
};
