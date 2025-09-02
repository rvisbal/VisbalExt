export interface TestClass {
    name: string;
    id: string;
    methods: string[];
    namePrefix?: string;
    symbolTable?: any;
    attributes: {
        fileName: string;
        fullName: string;
    };
}

export interface OrgTestClasses {
    testClasses: TestClass[];
}

export interface TestClassesCache {
    [alias: string]: OrgTestClasses | undefined;
} 