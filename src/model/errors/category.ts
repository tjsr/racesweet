
class CategoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CategoryError";
  }
}

export class CategoryCreateError extends CategoryError {
  constructor(message: string) {
    super(message);
    this.name = "CategoryCreateError";
  }
}
