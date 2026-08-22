import {
  defineConfig,
  globalIgnores,
} from "eslint/config";

import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  /*
   * J10 client pages load authenticated workspace data after mounting.
   * State changes happen inside asynchronous loading functions rather
   * than directly representing derived render state.
   */
  {
    name:
      "j10/client-data-loading",

    files: [
      "app/dashboard/**/*.tsx",
      "components/**/*.tsx",
    ],

    rules: {
      "react-hooks/set-state-in-effect":
        "off",
    },
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;