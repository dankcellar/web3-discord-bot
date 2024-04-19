export class SQLQueryBuilder {
  query: {
    operation: any;
    table: any;
    columns: any[];
    where: any[];
    set: any[]; // For UPDATE key-value pairs
    orderBy: any[];
    limit: any;
    offset: any;
    returning: any[];
  };

  constructor() {
    this.query = {
      operation: null,
      table: null,
      columns: [],
      where: [],
      set: [], // For UPDATE key-value pairs
      orderBy: [],
      limit: null,
      offset: null,
      returning: [],
    };
  }

  select(columns) {
    this.query.operation = 'SELECT';
    this.query.columns = Array.isArray(columns) ? columns : [columns];
    return this;
  }

  from(table) {
    this.query.table = table;
    return this;
  }

  update(table) {
    this.query.operation = 'UPDATE';
    this.query.table = table;
    return this;
  }

  delete(table) {
    this.query.operation = 'DELETE';
    this.query.table = table;
    return this;
  }

  where(condition) {
    this.query.where.push(condition);
    return this;
  }

  set(key, value) {
    this.query.set.push({ key, value });
    return this;
  }

  orderBy(column, direction = 'ASC') {
    this.query.orderBy.push({ column, direction });
    return this;
  }

  page(count, start) {
    if (count > 0) this.query.limit = count;
    if (start > 0) this.query.offset = start;
    return this;
  }

  returning(columns) {
    this.query.returning = Array.isArray(columns) ? columns : [columns];
    return this;
  }

  build() {
    let queryParts = [this.query.operation];

    // SELECT Columns
    if (this.query.operation === 'SELECT') {
      queryParts.push(this.query.columns.length > 0 ? this.query.columns.join(', ') : '*');
      queryParts.push('FROM ' + this.query.table);
    }

    // UPDATE Set
    if (this.query.operation === 'UPDATE') {
      queryParts.push(this.query.table);
      let setParts = this.query.set.map((item) => `${item.key} = '${item.value}'`);
      queryParts.push('SET ' + setParts.join(', '));
    }

    // DELETE FROM
    if (this.query.operation === 'DELETE') {
      queryParts.push('FROM ' + this.query.table);
    }

    // WHERE
    if (this.query.where.length > 0) {
      queryParts.push('WHERE ' + this.query.where.join(' AND '));
    }

    // ORDER BY
    if (this.query.orderBy.length > 0) {
      let orderParts = this.query.orderBy.map((item) => `${item.column} ${item.direction}`);
      queryParts.push('ORDER BY ' + orderParts.join(', '));
    }

    // LIMIT
    if (this.query.limit) {
      queryParts.push(`LIMIT ${this.query.limit}`);
    }

    // OFFSET
    if (this.query.offset) {
      queryParts.push(`OFFSET ${this.query.offset}`);
    }

    // RETURNING
    if (this.query.returning.length > 0) {
      queryParts.push(`RETURNING ${this.query.returning.join(', ')}`);
    }

    return queryParts.join(' ');
  }
}
