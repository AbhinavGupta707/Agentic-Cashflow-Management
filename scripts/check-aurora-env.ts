type RequiredEnv = {
  name: string;
  secret: boolean;
  description: string;
};

const requiredEnv: RequiredEnv[] = [
  {
    name: "AWS_REGION",
    secret: false,
    description: "AWS region for the Aurora cluster, expected eu-west-2 for H0.",
  },
  {
    name: "AURORA_CLUSTER_ARN",
    secret: false,
    description: "RDS cluster ARN used by the Data API.",
  },
  {
    name: "AURORA_SECRET_ARN",
    secret: true,
    description: "Secrets Manager ARN for the cash_management app database user.",
  },
  {
    name: "AURORA_DATABASE",
    secret: false,
    description: "Database name, expected cash_management.",
  },
];

function mask(value: string, secret: boolean): string {
  if (!secret) {
    return value;
  }

  if (value.length <= 12) {
    return "[set]";
  }

  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

let hasError = false;

for (const item of requiredEnv) {
  const value = process.env[item.name];

  if (!value) {
    hasError = true;
    console.error(`missing ${item.name}: ${item.description}`);
    continue;
  }

  console.log(`ok ${item.name}=${mask(value, item.secret)}`);
}

if (process.env.AURORA_DATABASE && process.env.AURORA_DATABASE !== "cash_management") {
  hasError = true;
  console.error(`unexpected AURORA_DATABASE=${process.env.AURORA_DATABASE}; expected cash_management`);
}

if (process.env.AWS_REGION && process.env.AWS_REGION !== "eu-west-2") {
  console.warn(`warning AWS_REGION=${process.env.AWS_REGION}; checkpoint 0 records eu-west-2`);
}

if (hasError) {
  process.exitCode = 1;
} else {
  console.log("Aurora migration environment looks complete.");
}
