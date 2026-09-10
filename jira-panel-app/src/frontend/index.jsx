import React, { useEffect, useState } from "react";
import ForgeReconciler, { Text, Stack, Link, Badge, Spinner, Box } from "@forge/react";
import { invoke } from "@forge/bridge";

const STATUS_APPEARANCE = {
  pass: "success",
  fail: "removed",
  blocked: "moved",
  in_progress: "inprogress",
  not_executed: "default",
};

function App() {
  const [executions, setExecutions] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    invoke("getExecutions")
      .then((res) => setExecutions(res.executions))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <Text>Could not load Apollo test results: {error}</Text>;
  if (executions === null) return <Spinner size="small" />;
  if (executions.length === 0) return <Text>No linked Apollo test executions.</Text>;

  return (
    <Stack space="space.150">
      {executions.map((e) => (
        <Box key={e.id} padding="space.050">
          <Stack space="space.050">
            <Link href={e.url} openNewTab>
              {e.caseKey ? `${e.caseKey}: ${e.caseTitle}` : e.caseTitle}
            </Link>
            <Text>
              {e.projectName} · {e.cycleName}
            </Text>
            <Badge text={e.status} appearance={STATUS_APPEARANCE[e.status] ?? "default"} />
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

ForgeReconciler.render(<App />);
