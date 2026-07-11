import next from "eslint-config-next";

const eslintConfig = [
  ...next,
  {
    ignores: ["scripts/**", ".next/**"],
  },
];

export default eslintConfig;
