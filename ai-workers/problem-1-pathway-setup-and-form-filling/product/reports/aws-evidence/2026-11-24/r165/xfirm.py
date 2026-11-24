import base64,json,subprocess as s
code='(async()=>{const {chooseFiles}=await import(process.cwd()+"/api/src/platform/files/choose.ts");const f=chooseFiles();const A="11111111-1111-4111-8111-111111111111",B="22222222-2222-4222-8222-222222222222",K="proof-r165-run24.txt";await f.put(A,K,new TextEncoder().encode("sample"),"text/plain");const a=await f.get(A,K),b=await f.get(B,K);let k="none";try{await f.get(B,"../"+A+"/"+K);k="SERVED"}catch(e){k="refused"}console.log("XFIRM adapter="+f.constructor.name+" ownFirmReads="+(a?new TextDecoder().decode(a.bytes):"null")+" otherFirmReads="+(b===null?"null":"SERVED")+" pathTrick="+k);process.exit(a&&b===null&&k==="refused"?0:1)})().catch(e=>{console.log("XFIRM error "+e.name+" "+String(e.message).slice(0,150));process.exit(2)})'
def aws(*a): return s.run(["aws",*a,"--output","json"],capture_output=True,text=True,check=True).stdout
J=json.loads
cl=J(aws("ecs","list-clusters"))["clusterArns"][0]
td=J(aws("ecs","list-task-definitions","--family-prefix","xrstagingAppTask7031B6E4","--sort","DESC"))["taskDefinitionArns"][0]
c=J(aws("ecs","describe-task-definition","--task-definition",td))["taskDefinition"]["containerDefinitions"][0]
print(td.split("/")[-1],[e for e in c["environment"] if e["name"].startswith("PLATFORM_FILES")])
o={x["OutputKey"]:x["OutputValue"] for x in J(aws("cloudformation","describe-stacks","--stack-name","xr-staging"))["Stacks"][0]["Outputs"]}
g=lambda p:[v for k,v in o.items() if k.startswith(p)][0]
n={"awsvpcConfiguration":{"subnets":g("AppAppSubnets").split(","),"securityGroups":[g("AppMigrateSecurityGroup")],"assignPublicIp":"DISABLED"}}
t=J(aws("ecs","run-task","--cluster",cl,"--task-definition",td,"--launch-type","FARGATE","--network-configuration",json.dumps(n),"--overrides",json.dumps({"containerOverrides":[{"name":c["name"],"command":["sh","-c","echo "+base64.b64encode(code.encode()).decode()+" | base64 -d > /tmp/x.mts && ./node_modules/.bin/tsx --tsconfig api/tsconfig.json /tmp/x.mts; echo XFIRM rc=$?"]}]})))["tasks"][0]["taskArn"]
print(t.split("/")[-1]); aws("ecs","wait","tasks-stopped","--cluster",cl,"--tasks",t)
d=J(aws("ecs","describe-tasks","--cluster",cl,"--tasks",t))["tasks"][0]; print(d.get("stoppedReason"),[x.get("exitCode") for x in d["containers"]])
l=c["logConfiguration"]["options"]
for e in J(aws("logs","get-log-events","--log-group-name",l["awslogs-group"],"--log-stream-name",l["awslogs-stream-prefix"]+"/"+c["name"]+"/"+t.split("/")[-1]))["events"][-8:]: print(e["message"][:260])
