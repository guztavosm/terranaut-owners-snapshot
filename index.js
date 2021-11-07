const fs = require("fs");
const axios = require("axios");

const TERRANAUTS_CONTRACT_ADDRESS =
  "terra1whyze49j9d0672pleaflk0wfufxrh8l0at2h8q";

const START_ID = 1;
const END_ID = 8621;
const IDS_PER_QUERY = 1000;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function generateQuery(id) {
  // NOTE: GraphQL does not allow using a number as the name of a query. Therefore instead of id,
  // we use `id_${id}`
  return `  
    id_${id}: WasmContractsContractAddressStore(
      ContractAddress: "${TERRANAUTS_CONTRACT_ADDRESS}",
      QueryMsg: "{\\"owner_of\\":{\\"token_id\\":\\"${id}\\"}}"
    ) { 
      Result 
    }
  `;
}

function generateQueries(start, end) {
  let queries = [];
  for (let id = start; id < end; id++) {
    queries.push(generateQuery(id));
  }
  return `
    query {
      ${queries.join("\n")}
    }
  `;
}

async function fetchTerranautOwners() {
  let owners = {};
  let start = START_ID;
  let end = start + IDS_PER_QUERY;

  while (start < end) {
    process.stdout.write(`querying owners of id ${start} to ${end - 1}... `);
    const response = await axios.post("https://mantle.terra.dev/", {
      query: generateQueries(start, end),
    });
    console.log("success!");
    // console.log(response.data);

    if (!response?.data?.data) {
      // Wait 500ms and redo query if no data
      console.log("We got an error, redoing query");
      await sleep(500);
      continue;
    }

    for (const [key, value] of Object.entries(response.data.data)) {
      const id = parseInt(key.slice(3));
      if (!!value?.Result) {
        const ownerOfResponse = JSON.parse(value.Result);
        owners[id] = ownerOfResponse.owner;
      } else {
        console.log(id);
        console.log(value);
      }
    }

    start = end;
    end += IDS_PER_QUERY;
    if (end > END_ID) end = END_ID;
  }

  return owners;
}

(async function () {
  const owners = await fetchTerranautOwners();

  // Group wallets and make it an array
  const ownersGrouped = {};
  for (const token_id in owners) {
    if (!ownersGrouped.hasOwnProperty(owners[token_id])) {
      const groupedOwner = {
        owner: owners[token_id],
        tokens_found: 1,
        token_ids: [token_id],
      };
      ownersGrouped[groupedOwner.owner] = groupedOwner;
    } else {
      ownersGrouped[owners[token_id]].tokens_found++;
      ownersGrouped[owners[token_id]].token_ids.push(token_id);
    }
  }

  let snapshotArray = Object.values(ownersGrouped);

  // Sort by token numbers
  snapshotArray = snapshotArray.sort((a, b) =>
    a.tokens_found < b.tokens_found ? -1 : 1
  );

  const totalTokensFound = snapshotArray.reduce(
    (sum, item) => (sum += item.tokens_found),
    0
  );

  const now = new Date();
  fs.writeFileSync("./terranaut_owners.json", JSON.stringify(snapshotArray, null, 2));
  console.log(`Snapshot taken successfully at: ${now}`);
  console.log(`Terranauts Found: ${totalTokensFound}`);
  console.log(`Unique Owners found: ${snapshotArray.length}`);
})();
