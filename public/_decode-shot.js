const fs = require("fs");
const j = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const data = j.data || (j.result && j.result.data);
if (!data) {
  console.log(Object.keys(j));
  process.exit(1);
}
fs.writeFileSync(process.argv[3], Buffer.from(data, "base64"));
console.log("wrote", data.length);
