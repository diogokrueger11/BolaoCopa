const { syncBitrixUsers } = require("../server");

syncBitrixUsers()
  .then(result => console.log(JSON.stringify(result, null, 2)))
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
