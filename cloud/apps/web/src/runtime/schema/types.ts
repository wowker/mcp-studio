export type SchemaIssue={path:string;code:string};
export type SchemaValidation={supported:boolean;valid:boolean;errors:SchemaIssue[];reason?:string};
export const unsupported=(reason:string):SchemaValidation=>({supported:false,valid:false,errors:[],reason});
